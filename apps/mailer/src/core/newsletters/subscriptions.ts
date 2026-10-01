import { z } from "zod";
import {
  NewsletterFilter,
  type NewsletterPageQuery,
  type NewsletterSubscriptionRecord,
  type NewsletterFilter as Filter,
} from "@flaresend/types";
import { pageClause, paginate, parseJson, likeEscape } from "../../db/client";
import type { ProjectRow } from "../../db/projects";
import { ApiError } from "../../http/errors";
import { newId, nowIso } from "../ids";
import { hmacSha256, sha256Hex, toBase64Url, timingSafeEqual } from "../keys";
import { upsertContact } from "../contacts";
import { sendEmail } from "../send";
import { escapeHtml } from "../mustache";
import { confirmationReady } from "./policy";
import {
  active,
  all,
  one,
  guarded,
  parse,
  rate,
  limit,
  requirePublication,
  secret,
  publicationUrl,
  type PublicationRow,
} from "./shared";

export interface SubscriptionRow {
  id: string;
  project_id: string;
  publication_id: string;
  contact_id: string;
  status: NewsletterSubscriptionRecord["status"];
  source: string;
  consent_source: string;
  consent_at: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  revision: number;
  created_at: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unsubscribed: number;
  suppressed: number;
  address_blocked: number;
}
export const SUB_SELECT = `SELECT s.*,c.email,c.first_name,c.last_name,c.unsubscribed,EXISTS(SELECT 1 FROM suppressions x WHERE x.address=c.email) AS suppressed,EXISTS(SELECT 1 FROM newsletter_address_blocks b WHERE b.publication_id=s.publication_id AND b.address_hmac=c.newsletter_address_hmac) AS address_blocked FROM newsletter_subscriptions s JOIN contacts c ON c.id=s.contact_id`;
export function filterSql(raw: Filter = {}) {
  const f = parse(NewsletterFilter, raw);
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.status) {
    where.push("s.status=?");
    args.push(f.status);
  }
  if (f.q) {
    where.push(
      "(c.email LIKE ? ESCAPE '\\' OR c.first_name LIKE ? ESCAPE '\\' OR c.last_name LIKE ? ESCAPE '\\')",
    );
    const q = `%${likeEscape(f.q)}%`;
    args.push(q, q, q);
  }
  if (f.tags?.length) {
    where.push(
      `EXISTS(SELECT 1 FROM newsletter_subscription_tags st WHERE st.subscription_id=s.id AND st.tag_id IN (${f.tags.map(() => "?").join(",")}))`,
    );
    args.push(...f.tags);
  }
  if (f.sources?.length) {
    where.push(`s.source IN (${f.sources.map(() => "?").join(",")})`);
    args.push(...f.sources);
  }
  if (f.since) {
    where.push("s.created_at>=?");
    args.push(f.since);
  }
  if (f.until) {
    where.push("s.created_at<?");
    args.push(f.until);
  }
  if (f.audienceId) {
    where.push(
      "EXISTS(SELECT 1 FROM audience_contacts ac JOIN audiences a ON a.id=ac.audience_id WHERE ac.contact_id=s.contact_id AND ac.audience_id=? AND a.project_id=s.project_id)",
    );
    args.push(f.audienceId);
  }
  return { where, args };
}
export const ELIGIBLE =
  "s.status='subscribed' AND c.unsubscribed=0 AND NOT EXISTS(SELECT 1 FROM suppressions x WHERE x.address=c.email) AND NOT EXISTS(SELECT 1 FROM newsletter_address_blocks b WHERE b.publication_id=s.publication_id AND b.address_hmac=c.newsletter_address_hmac)";
export async function requireSubscriber(
  env: Env,
  projectId: string,
  id: string,
  subscriptionId: string,
) {
  await requirePublication(env, projectId, id);
  const s = await one<SubscriptionRow>(
    env.DB.prepare(
      `${SUB_SELECT} WHERE s.id=? AND s.publication_id=? AND s.project_id=?`,
    ).bind(subscriptionId, id, projectId),
  );
  if (!s)
    throw ApiError.notFound(
      "subscription_not_found",
      "The subscriber was not found.",
    );
  return s;
}
async function record(
  env: Env,
  s: SubscriptionRow,
): Promise<NewsletterSubscriptionRecord> {
  const tags = await all<{ tag_id: string }>(
    env.DB.prepare(
      "SELECT tag_id FROM newsletter_subscription_tags WHERE subscription_id=?",
    ).bind(s.id),
  );
  return {
    id: s.id,
    publicationId: s.publication_id,
    contactId: s.contact_id,
    email: s.email,
    firstName: s.first_name,
    lastName: s.last_name,
    status: s.status,
    source: s.source,
    consentSource: s.consent_source,
    consentAt: s.consent_at,
    confirmedAt: s.confirmed_at,
    unsubscribedAt: s.unsubscribed_at,
    revision: s.revision,
    createdAt: s.created_at,
    tags: tags.map((t) => t.tag_id),
    blocked: !!(s.unsubscribed || s.suppressed || s.address_blocked),
  };
}
export async function listSubscribers(
  env: Env,
  project: ProjectRow,
  id: string,
  query: NewsletterPageQuery = {},
) {
  await requirePublication(env, project.id, id);
  const f = filterSql(query.filter);
  const where = ["s.publication_id=?", "s.project_id=?", ...f.where];
  const args: unknown[] = [id, project.id, ...f.args];
  pageClause(query.cursor, where, args, "s");
  const rows = await all<SubscriptionRow>(
    env.DB.prepare(
      `${SUB_SELECT} WHERE ${where.join(" AND ")} ORDER BY s.created_at DESC,s.id DESC LIMIT ?`,
    ).bind(...args, limit(query) + 1),
  );
  const page = paginate(rows, limit(query));
  return {
    data: await Promise.all(page.rows.map((s) => record(env, s))),
    nextCursor: page.nextCursor,
  };
}
export async function getSubscriber(
  env: Env,
  project: ProjectRow,
  id: string,
  subscriptionId: string,
) {
  const s = await requireSubscriber(env, project.id, id, subscriptionId);
  const result = await record(env, s);
  const events = await all<{
    id: string;
    type: string;
    occurred_at: string;
    actor_kind: string;
    data_json: string;
  }>(
    env.DB.prepare(
      "SELECT * FROM newsletter_subscription_events WHERE subscription_id=? ORDER BY occurred_at DESC,id DESC LIMIT 100",
    ).bind(s.id),
  );
  return {
    ...result,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurred_at,
      actorKind: e.actor_kind,
      data: parseJson<Record<string, unknown>>(e.data_json, {}),
    })),
  };
}
export async function subscriberCounts(
  env: Env,
  project: ProjectRow,
  id: string,
  filter: Filter = {},
) {
  await requirePublication(env, project.id, id);
  const f = filterSql(filter);
  const eligible = await one<{ n: number }>(
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM newsletter_subscriptions s JOIN contacts c ON c.id=s.contact_id WHERE s.publication_id=? AND s.project_id=? AND ${ELIGIBLE}${f.where.length ? ` AND ${f.where.join(" AND ")}` : ""}`,
    ).bind(id, project.id, ...f.args),
  );
  const rows = await all<{ status: string; n: number }>(
    env.DB.prepare(
      "SELECT status,COUNT(*) AS n FROM newsletter_subscriptions WHERE publication_id=? GROUP BY status",
    ).bind(id),
  );
  const suppressed = await one<{ n: number }>(
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM (${SUB_SELECT} WHERE s.publication_id=?) WHERE status='subscribed' AND (suppressed=1 OR unsubscribed=1 OR address_blocked=1)`,
    ).bind(id),
  );
  return {
    eligible: eligible?.n ?? 0,
    excluded: {
      pending: rows.find((r) => r.status === "pending")?.n ?? 0,
      unsubscribed: rows.find((r) => r.status === "unsubscribed")?.n ?? 0,
      suppressed: suppressed?.n ?? 0,
    },
  };
}
export function eventStmt(
  env: Env,
  s: { id: string; project_id: string; publication_id: string },
  type: string,
  actor: string,
  data: object = {},
) {
  return env.DB.prepare(
    "INSERT INTO newsletter_subscription_events(id,project_id,publication_id,subscription_id,type,occurred_at,actor_kind,data_json) VALUES(?,?,?,?,?,?,?,?)",
  ).bind(
    newId("nse"),
    s.project_id,
    s.publication_id,
    s.id,
    type,
    nowIso(),
    actor,
    JSON.stringify(data),
  );
}
export async function addressHash(env: Env, email: string) {
  const key = secret(env, "NEWSLETTER_ADDRESS_SECRET");
  if (!key)
    throw ApiError.conflict(
      "newsletter_secrets_missing",
      "Configure NEWSLETTER_ADDRESS_SECRET first.",
    );
  return toBase64Url(
    await hmacSha256(key, `address:${email.trim().toLowerCase()}`),
  );
}
export async function updateSubscriber(
  env: Env,
  project: ProjectRow,
  id: string,
  subscriptionId: string,
  raw: unknown,
) {
  active(project, await requirePublication(env, project.id, id));
  const s = await requireSubscriber(env, project.id, id, subscriptionId);
  const input = parse(
    z
      .object({
        expectedRevision: z.number().int().positive(),
        firstName: z.string().max(200).nullable().optional(),
        lastName: z.string().max(200).nullable().optional(),
        tags: z.array(z.string()).max(20).optional(),
      })
      .strict(),
    raw,
  );
  if (input.tags)
    for (const tag of new Set(input.tags)) {
      if (
        !(await one(
          env.DB.prepare(
            "SELECT id FROM newsletter_tags WHERE id=? AND publication_id=? AND project_id=?",
          ).bind(tag, id, project.id),
        ))
      )
        throw ApiError.validation(
          "invalid_tag",
          "A tag does not belong to this newsletter.",
        );
    }
  await guarded(
    env,
    env.DB.prepare(
      "UPDATE newsletter_subscriptions SET revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=?",
    ).bind(nowIso(), s.id, project.id, input.expectedRevision),
    [
      env.DB.prepare(
        "UPDATE contacts SET first_name=?,last_name=?,updated_at=? WHERE id=? AND project_id=?",
      ).bind(
        input.firstName === undefined ? s.first_name : input.firstName,
        input.lastName === undefined ? s.last_name : input.lastName,
        nowIso(),
        s.contact_id,
        project.id,
      ),
      ...(input.tags
        ? [
            env.DB.prepare(
              "DELETE FROM newsletter_subscription_tags WHERE subscription_id=?",
            ).bind(s.id),
            ...[...new Set(input.tags)].map((tag) =>
              env.DB.prepare(
                "INSERT INTO newsletter_subscription_tags(project_id,publication_id,subscription_id,tag_id) VALUES(?,?,?,?)",
              ).bind(project.id, id, s.id, tag),
            ),
          ]
        : []),
    ],
  );
  return getSubscriber(env, project, id, s.id);
}
export async function unsubscribe(
  env: Env,
  project: ProjectRow,
  id: string,
  subscriptionId: string,
  expectedRevision?: number,
  actor = "admin",
  data: { runId?: string } = {},
) {
  const s = await requireSubscriber(env, project.id, id, subscriptionId);
  if (s.status === "unsubscribed") return getSubscriber(env, project, id, s.id);
  const hash = await addressHash(env, s.email);
  const now = nowIso();
  await guarded(
    env,
    env.DB.prepare(
      "UPDATE newsletter_subscriptions SET status='unsubscribed',unsubscribed_at=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=?",
    ).bind(now, now, s.id, project.id, expectedRevision ?? s.revision),
    [
      env.DB.prepare(
        "UPDATE contacts SET newsletter_address_hmac=? WHERE id=?",
      ).bind(hash, s.contact_id),
      env.DB.prepare(
        "INSERT OR IGNORE INTO newsletter_address_blocks(project_id,publication_id,address_hmac,reason,created_at) VALUES(?,?,?,'unsubscribe',?)",
      ).bind(project.id, id, hash, now),
      eventStmt(env, s, "unsubscribed", actor, data),
      env.DB.prepare(
        "DELETE FROM newsletter_tokens WHERE subscription_id=?",
      ).bind(s.id),
      env.DB.prepare(
        "UPDATE newsletter_run_recipients SET status='skipped',skip_reason='unsubscribed',updated_at=? WHERE subscription_id=? AND status='pending'",
      ).bind(now, s.id),
    ],
  );
  return getSubscriber(env, project, id, s.id);
}
export async function deleteSubscriber(
  env: Env,
  project: ProjectRow,
  id: string,
  subscriptionId: string,
  expectedRevision: number,
) {
  active(project);
  const s = await requireSubscriber(env, project.id, id, subscriptionId);
  const hash = await addressHash(env, s.email);
  await guarded(
    env,
    env.DB.prepare(
      "DELETE FROM newsletter_subscriptions WHERE id=? AND project_id=? AND revision=?",
    ).bind(s.id, project.id, expectedRevision),
    [
      env.DB.prepare(
        "INSERT OR IGNORE INTO newsletter_address_blocks(project_id,publication_id,address_hmac,reason,created_at) VALUES(?,?,?,'deletion',?)",
      ).bind(project.id, id, hash, nowIso()),
      env.DB.prepare(
        "UPDATE newsletter_run_recipients SET address_snapshot=NULL,personalization_json='{}',subscription_id=NULL,contact_id=NULL,status=CASE WHEN status IN ('pending','queued','retry_wait') THEN 'canceled' ELSE status END WHERE subscription_id=?",
      ).bind(s.id),
      env.DB.prepare(
        "DELETE FROM contacts WHERE id=? AND NOT EXISTS(SELECT 1 FROM newsletter_subscriptions WHERE contact_id=?) AND NOT EXISTS(SELECT 1 FROM audience_contacts WHERE contact_id=?)",
      ).bind(s.contact_id, s.contact_id, s.contact_id),
    ],
  );
  return { deleted: true as const };
}
export async function listTags(env: Env, project: ProjectRow, id: string) {
  await requirePublication(env, project.id, id);
  return all<{ id: string; name: string }>(
    env.DB.prepare(
      "SELECT id,name FROM newsletter_tags WHERE publication_id=? ORDER BY name",
    ).bind(id),
  );
}
export async function createTag(
  env: Env,
  project: ProjectRow,
  id: string,
  name: string,
) {
  active(project, await requirePublication(env, project.id, id));
  name = parse(z.string().trim().min(1).max(100), name);
  const tagId = newId("tag");
  await env.DB.prepare(
    "INSERT OR IGNORE INTO newsletter_tags(id,project_id,publication_id,name) VALUES(?,?,?,?)",
  )
    .bind(tagId, project.id, id, name)
    .run();
  return (await one<{ id: string; name: string }>(
    env.DB.prepare(
      "SELECT id,name FROM newsletter_tags WHERE publication_id=? AND name=?",
    ).bind(id, name),
  ))!;
}
export async function deleteTag(
  env: Env,
  project: ProjectRow,
  id: string,
  tagId: string,
) {
  active(project, await requirePublication(env, project.id, id));
  await env.DB.prepare(
    "DELETE FROM newsletter_tags WHERE id=? AND publication_id=? AND project_id=?",
  )
    .bind(tagId, id, project.id)
    .run();
  return { deleted: true as const };
}

export async function signToken(env: Env, purpose: string, payload: string) {
  const key = secret(env, "NEWSLETTER_TOKEN_SECRET");
  if (!key)
    throw ApiError.conflict(
      "newsletter_secrets_missing",
      "Configure NEWSLETTER_TOKEN_SECRET first.",
    );
  const kid = secret(env, "NEWSLETTER_TOKEN_KEY_ID") || "v1";
  return `${kid}.${payload}.${toBase64Url(await hmacSha256(key, `${purpose}:${kid}:${payload}`))}`;
}
export async function verifySignedToken(
  env: Env,
  purpose: string,
  token: string,
) {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 1024) return null;
  const [kid, payload, signature] = parts as [string, string, string];
  const currentKid = secret(env, "NEWSLETTER_TOKEN_KEY_ID") || "v1";
  const previous = parseJson<Record<string, string>>(
    secret(env, "NEWSLETTER_PREVIOUS_TOKEN_KEYS"),
    {},
  );
  const key =
    kid === currentKid ? secret(env, "NEWSLETTER_TOKEN_SECRET") : previous[kid];
  if (
    !key ||
    !(await timingSafeEqual(
      signature,
      toBase64Url(await hmacSha256(key, `${purpose}:${kid}:${payload}`)),
    ))
  )
    return null;
  return payload;
}
/** Payload `publication~subscription[~run]`. The run part lets a report count unsubscribes per email. */
export async function unsubscribeToken(
  env: Env,
  publicationId: string,
  subscriptionId: string,
  runId?: string,
) {
  return signToken(
    env,
    "unsubscribe",
    [publicationId, subscriptionId, ...(runId ? [runId] : [])].join("~"),
  );
}
const CONFIRMATION_ELIGIBLE = `consumed_at IS NULL AND expires_at>? AND EXISTS(
  SELECT 1 FROM newsletter_subscriptions s
  JOIN contacts c ON c.id=s.contact_id
  JOIN publications p ON p.id=s.publication_id
  JOIN projects pr ON pr.id=s.project_id
  WHERE s.id=newsletter_tokens.subscription_id
    AND s.publication_id=newsletter_tokens.publication_id
    AND s.project_id=newsletter_tokens.project_id
    AND s.revision=newsletter_tokens.subscription_revision
    AND s.status IN ('pending','unsubscribed')
    AND c.unsubscribed=0
    AND NOT EXISTS(SELECT 1 FROM suppressions x WHERE x.address=c.email)
    AND p.status='active' AND p.form_enabled=1 AND p.site_enabled=1
    AND p.from_address IS NOT NULL AND pr.disabled_at IS NULL
)`;
export async function confirmationEligible(env: Env, hash: string) {
  if (!hash) return false;
  return !!(await one(
    env.DB.prepare(
      `SELECT token_hash FROM newsletter_tokens WHERE token_hash=? AND ${CONFIRMATION_ELIGIBLE}`,
    ).bind(hash, nowIso()),
  ));
}
export async function requestSubscription(
  env: Env,
  project: ProjectRow,
  p: PublicationRow,
  raw: unknown,
  ip: string,
) {
  active(project, p);
  if (
    !p.form_enabled ||
    !p.site_enabled ||
    !(await confirmationReady(env, project, p))
  )
    throw ApiError.conflict(
      "confirmation_sender_unready",
      "Subscriptions are not available yet.",
    );
  const input = parse(
    z
      .object({
        email: z.string().trim().toLowerCase().email(),
        firstName: z.string().max(200).optional(),
        consent: z.literal("yes"),
        consentVersion: z.literal("v1").default("v1"),
        source: z.string().max(200).default("public_form"),
        website: z.string().optional(),
      })
      .strict(),
    raw,
  );
  if (input.website) return;
  const now = nowIso();
  const hash = await addressHash(env, input.email);
  const ipHash = await addressHash(env, `ip:${ip}`);
  await rate(env, `ip:${ipHash}`, now.slice(0, 15), 20);
  await rate(env, `address:${p.id}:${hash}`, now.slice(0, 13), 5);
  await rate(env, `publication:${p.id}`, now.slice(0, 13), 100);
  const contact = await upsertContact(env, project.id, {
    email: input.email,
    ...(input.firstName ? { firstName: input.firstName } : {}),
  });
  await env.DB.prepare(
    "UPDATE contacts SET newsletter_address_hmac=? WHERE id=?",
  )
    .bind(hash, contact.id)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO newsletter_subscriptions(id,project_id,publication_id,contact_id,status,source,consent_source,created_at,updated_at) VALUES(?,?,?,?,'pending',?,'public_form',?,?)",
  )
    .bind(newId("sub"), project.id, p.id, contact.id, input.source, now, now)
    .run();
  const s = await one<SubscriptionRow>(
    env.DB.prepare(
      `${SUB_SELECT} WHERE s.publication_id=? AND s.contact_id=?`,
    ).bind(p.id, contact.id),
  );
  if (!s || s.status === "subscribed" || s.suppressed || s.unsubscribed) return;
  const recent = await one(
    env.DB.prepare(
      "SELECT token_hash FROM newsletter_tokens WHERE subscription_id=? AND created_at>? AND consumed_at IS NULL",
    ).bind(s.id, new Date(Date.now() - 60_000).toISOString()),
  );
  if (recent) return;
  const random = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(random);
  const expires = new Date(Date.now() + 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM newsletter_tokens WHERE subscription_id=?",
    ).bind(s.id),
    env.DB.prepare(
      "INSERT INTO newsletter_tokens(token_hash,project_id,publication_id,subscription_id,subscription_revision,purpose,expires_at,created_at) VALUES(?,?,?,?,?,'confirmation',?,?)",
    ).bind(tokenHash, project.id, p.id, s.id, s.revision, expires, now),
  ]);
  const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/n/confirm/${random}`;
  await sendEmail(
    env,
    { project, mode: "live", source: "http", apiKeyId: null },
    {
      from: p.from_address!,
      to: input.email,
      subject: `Confirm your subscription to ${p.name}`,
      html: `<p>Confirm your subscription to ${escapeHtml(p.name)}.</p><p><a href="${escapeHtml(url)}">Confirm subscription</a></p><p>This link expires in 24 hours. If you did not request it, ignore this email.</p>`,
      text: `Confirm your subscription to ${p.name}: ${url}\nThis link expires in 24 hours.`,
      trackOpens: false,
      trackClicks: false,
    },
    {
      purpose: "subscription_confirmation",
      newsletterTokenHash: tokenHash,
      idempotencyKey: `confirmation:${tokenHash}`,
    },
  );
}
export async function confirmSubscription(env: Env, token: string) {
  if (token.length > 100) return false;
  const hash = await sha256Hex(token);
  const row = await one<{
    token_hash: string;
    subscription_id: string;
    publication_id: string;
    project_id: string;
    subscription_revision: number;
  }>(
    env.DB.prepare(
      "SELECT * FROM newsletter_tokens WHERE token_hash=? AND expires_at>? AND consumed_at IS NULL",
    ).bind(hash, nowIso()),
  );
  if (!row || !(await confirmationEligible(env, hash))) return false;
  const s = await requireSubscriber(
    env,
    row.project_id,
    row.publication_id,
    row.subscription_id,
  );
  if (s.suppressed || s.unsubscribed) return false;
  const addr = await addressHash(env, s.email);
  const now = nowIso();
  try {
    await guarded(
      env,
      env.DB.prepare(
        `UPDATE newsletter_tokens SET consumed_at=? WHERE token_hash=? AND ${CONFIRMATION_ELIGIBLE}`,
      ).bind(now, hash, now),
      [
        env.DB.prepare(
          "UPDATE newsletter_subscriptions SET status='subscribed',consent_at=?,confirmed_at=?,consent_source='public_confirmation',revision=revision+1,updated_at=? WHERE id=? AND revision=?",
        ).bind(now, now, now, s.id, row.subscription_revision),
        env.DB.prepare(
          "DELETE FROM newsletter_address_blocks WHERE publication_id=? AND address_hmac=? AND reason='unsubscribe'",
        ).bind(row.publication_id, addr),
        eventStmt(env, s, "subscribed", "subscriber", { consentVersion: "v1" }),
      ],
    );
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === "revision_conflict")
      return false;
    throw error;
  }
}

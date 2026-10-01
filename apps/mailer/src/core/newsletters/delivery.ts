// Newsletter email delivery. A run freezes one content revision and one recipient list, then hands each
// recipient to the normal send pipeline (sendEmail) in chunks from the newsletter queue.
import {
  NewsletterSendInput,
  NewsletterTheme,
  formatDisplayAddress,
  type NewsletterEmailRun,
  type NewsletterEmailSummary,
  type NewsletterRunDetail,
  type NewsletterRunRecipient,
} from "@flaresend/types";
import { z } from "zod";
import { pageClause, paginate, parseJson, likeEscape } from "../../db/client";
import { getProjectById, type ProjectRow } from "../../db/projects";
import { ApiError, toApiError } from "../../http/errors";
import { canonicalJson } from "../idempotency";
import { newId, nowIso, utcDay } from "../ids";
import { sha256Hex } from "../keys";
import { sendEmail } from "../send";
import { EMAIL_BLOCKER_MESSAGE, emailBlocker } from "./policy";
import { renderNewsletter, type RenderOptions } from "./render";
import {
  active,
  all,
  one,
  parse,
  limit,
  publicationUrl,
  requirePost,
  requirePublication,
  revision,
  type PostRow,
  type PublicationRow,
} from "./shared";
import { ELIGIBLE, filterSql, getSubscriber, unsubscribeToken } from "./subscriptions";

/** Recipients handed to sendEmail per queue invocation. Each send makes several subrequests. */
export const RUN_CHUNK = 25;
const LEASE_MS = 5 * 60_000;

export interface RunRow {
  id: string;
  project_id: string;
  publication_id: string;
  post_id: string;
  revision_id: string;
  filter_json: string;
  status: NewsletterEmailRun["status"];
  scheduled_at: string | null;
  schedule_timezone: string | null;
  started_at: string | null;
  completed_at: string | null;
  request_key: string;
  request_hash: string;
  lease_token: string | null;
  lease_until: string | null;
  subject: string;
  total: number;
  created_at: string;
  updated_at: string;
}
interface RecipientRow {
  id: string;
  subscription_id: string | null;
  contact_id: string | null;
  address_snapshot: string | null;
  personalization_json: string;
  status: string;
  email_id: string | null;
  created_at: string;
}
export type RenderMeta = Omit<RenderOptions, "target" | "assetUrl" | "theme"> & {
  subject: string;
  theme: unknown;
};

export interface RunMessage {
  kind: "newsletter-run";
  runId: string;
}

function renderFor(
  env: Env,
  document: Parameters<typeof renderNewsletter>[0],
  meta: RenderMeta,
  values: RenderOptions["values"],
  unsubscribeUrl: string,
) {
  return renderNewsletter(document, {
    title: meta.title,
    subtitle: meta.subtitle,
    previewText: meta.previewText,
    publicationName: meta.publicationName,
    postalAddress: meta.postalAddress,
    logoAssetId: meta.logoAssetId,
    theme: parse(NewsletterTheme, meta.theme ?? {}),
    target: "email",
    values,
    assetUrl: (asset) => `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/n/assets/${asset}`,
    unsubscribeUrl,
  });
}

function sender(p: PublicationRow) {
  return formatDisplayAddress({
    address: p.from_address!,
    name: p.from_name || p.name,
  });
}

async function requireSender(env: Env, project: ProjectRow, p: PublicationRow) {
  const blocker = await emailBlocker(env, project, p);
  if (blocker)
    throw ApiError.conflict(
      "newsletter_sender_not_ready",
      EMAIL_BLOCKER_MESSAGE[blocker],
    );
}

function nonEmpty(post: PostRow, doc: { blocks: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> }) {
  return (
    !!post.title.trim() &&
    doc.blocks.some(
      (b) =>
        b.type !== "paragraph" ||
        (b.content ?? []).some((i) => i.type === "personalization" || !!i.text?.trim()),
    )
  );
}

export async function createRun(
  env: Env,
  project: ProjectRow,
  publicationId: string,
  postId: string,
  raw: unknown,
): Promise<NewsletterEmailRun> {
  const input = parse(NewsletterSendInput, raw);
  const p = await requirePublication(env, project.id, publicationId);
  active(project, p);
  const hash = await sha256Hex(
    canonicalJson({ publicationId, postId, ...input, idempotencyKey: undefined }),
  );
  const prior = await one<RunRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_email_runs WHERE project_id=? AND request_key=?",
    ).bind(project.id, input.idempotencyKey),
  );
  if (prior) {
    if (prior.request_hash !== hash)
      throw ApiError.conflict(
        "idempotency_payload_mismatch",
        "This request key was used for a different send.",
      );
    return toRun(env, project, prior);
  }
  await requireSender(env, project, p);
  const post = await requirePost(env, project.id, publicationId, postId);
  // The content check: only the revision the user reviewed may go out.
  if (post.draft_revision_id !== input.revisionId)
    throw ApiError.conflict(
      "revision_conflict",
      "The post changed after you reviewed it. Review the current version.",
    );
  if (post.archived_at)
    throw ApiError.conflict("post_archived", "This post is archived.");
  const snapshot = await revision(env, post, input.revisionId);
  if (!nonEmpty(post, snapshot.document))
    throw ApiError.unprocessable(
      "invalid_document",
      "Add a title and content before sending.",
    );
  let at: string | null = null;
  if (input.scheduledAt) {
    const date = new Date(input.scheduledAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
      throw ApiError.validation(
        "invalid_schedule",
        "Select a future date and time.",
        "scheduledAt",
      );
    at = date.toISOString();
  }
  const meta = JSON.parse(snapshot.row.metadata_json) as RenderMeta;
  const { status: _ignored, ...filter } = input.filter;
  const f = filterSql(filter);
  const id = newId("run");
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO newsletter_email_runs(id,project_id,publication_id,post_id,revision_id,filter_json,snapshot_at,status,scheduled_at,schedule_timezone,started_at,provider_policy_version,request_key,request_hash,subject,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'',?,?,?,?,?)",
    ).bind(
      id,
      project.id,
      publicationId,
      postId,
      input.revisionId,
      JSON.stringify(filter),
      now,
      at ? "scheduled" : "sending",
      at,
      at ? input.timezone || p.timezone : null,
      at ? null : now,
      input.idempotencyKey,
      hash,
      meta.subject || post.subject || post.title,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO newsletter_run_recipients(id,project_id,publication_id,run_id,subscription_id,contact_id,address_snapshot,personalization_json,status,created_at,updated_at) SELECT 'nr_'||lower(hex(randomblob(16))),s.project_id,s.publication_id,?,s.id,c.id,c.email,json_object('firstName',c.first_name,'lastName',c.last_name),'pending',?,? FROM newsletter_subscriptions s JOIN contacts c ON c.id=s.contact_id WHERE s.project_id=? AND s.publication_id=? AND ${ELIGIBLE}${f.where.length ? ` AND ${f.where.join(" AND ")}` : ""}`,
    ).bind(id, now, now, project.id, publicationId, ...f.args),
    env.DB.prepare(
      "UPDATE newsletter_email_runs SET total=(SELECT COUNT(*) FROM newsletter_run_recipients WHERE run_id=?) WHERE id=?",
    ).bind(id, id),
  ]);
  const run = (await one<RunRow>(
    env.DB.prepare("SELECT * FROM newsletter_email_runs WHERE id=?").bind(id),
  ))!;
  if (!run.total) {
    await env.DB.prepare("DELETE FROM newsletter_email_runs WHERE id=?")
      .bind(id)
      .run();
    throw ApiError.unprocessable(
      "no_recipients",
      "No subscribers match this selection.",
    );
  }
  if (!at)
    await env.NEWSLETTER_QUEUE.send({ kind: "newsletter-run", runId: id } satisfies RunMessage);
  return toRun(env, project, run);
}

export type ProcessResult =
  | { state: "done" }
  | { state: "more" }
  | { state: "wait"; delaySeconds: number };

/** One queue invocation: send up to RUN_CHUNK recipients. Safe to call twice: a lease and idempotency keys stop duplicates. */
export async function processRun(env: Env, runId: string): Promise<ProcessResult> {
  const run = await one<RunRow>(
    env.DB.prepare("SELECT * FROM newsletter_email_runs WHERE id=?").bind(runId),
  );
  if (!run || run.status !== "sending") return { state: "done" };
  const lease = newId("lease");
  const now = nowIso();
  const claim = await env.DB.prepare(
    "UPDATE newsletter_email_runs SET lease_token=?,lease_until=? WHERE id=? AND status='sending' AND (lease_until IS NULL OR lease_until<?)",
  )
    .bind(lease, new Date(Date.now() + LEASE_MS).toISOString(), runId, now)
    .run();
  if (!claim.meta.changes) return { state: "done" };
  try {
    return await processLeased(env, run);
  } finally {
    await env.DB.prepare(
      "UPDATE newsletter_email_runs SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?",
    )
      .bind(nowIso(), runId, lease)
      .run();
  }
}

async function cancelAll(env: Env, runId: string) {
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE newsletter_email_runs SET status='canceled',completed_at=?,updated_at=? WHERE id=? AND status IN ('scheduled','sending')",
    ).bind(now, now, runId),
    env.DB.prepare(
      "UPDATE newsletter_run_recipients SET status='canceled',updated_at=? WHERE run_id=? AND status='pending'",
    ).bind(now, runId),
  ]);
}

async function processLeased(env: Env, run: RunRow): Promise<ProcessResult> {
  const project = await getProjectById(env.DB, run.project_id);
  const p = project
    ? await one<PublicationRow>(
        env.DB.prepare("SELECT * FROM publications WHERE id=?").bind(run.publication_id),
      )
    : null;
  if (!project || !p || project.disabled_at || p.status === "archived" || !p.from_address) {
    await cancelAll(env, run.id);
    return { state: "done" };
  }
  const post = await requirePost(env, project.id, run.publication_id, run.post_id);
  const snapshot = await revision(env, post, run.revision_id);
  const meta = JSON.parse(snapshot.row.metadata_json) as RenderMeta;
  const rows = await all<RecipientRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_run_recipients WHERE run_id=? AND status='pending' ORDER BY id LIMIT ?",
    ).bind(run.id, RUN_CHUNK),
  );
  if (rows.length) {
    // Someone may have unsubscribed or been suppressed since the run was created.
    const ids = rows.map((r) => r.subscription_id).filter((v): v is string => !!v);
    const stillEligible = new Set(
      ids.length
        ? (
            await all<{ id: string }>(
              env.DB.prepare(
                `SELECT s.id FROM newsletter_subscriptions s JOIN contacts c ON c.id=s.contact_id WHERE s.id IN (${ids.map(() => "?").join(",")}) AND ${ELIGIBLE}`,
              ).bind(...ids),
            )
          ).map((r) => r.id)
        : [],
    );
    for (const r of rows) {
      if (!r.subscription_id || !r.address_snapshot || !stillEligible.has(r.subscription_id)) {
        await env.DB.prepare(
          "UPDATE newsletter_run_recipients SET status='skipped',skip_reason='no_longer_eligible',updated_at=? WHERE id=? AND status='pending'",
        )
          .bind(nowIso(), r.id)
          .run();
        continue;
      }
      const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
      const token = await unsubscribeToken(env, run.publication_id, r.subscription_id, run.id);
      const unsubscribeUrl = `${base}/n/u/${token}`;
      const out = renderFor(
        env,
        snapshot.document,
        meta,
        parseJson(r.personalization_json, {}),
        unsubscribeUrl,
      );
      try {
        const result = await sendEmail(
          env,
          { project, mode: "live", source: "broadcast", apiKeyId: null },
          {
            from: sender(p),
            to: r.address_snapshot,
            ...(p.reply_to ? { replyTo: p.reply_to } : {}),
            subject: run.subject || meta.subject,
            html: out.html,
            text: out.text,
          },
          {
            purpose: "newsletter",
            idempotencyKey: `nl:${run.id}:${r.id}`,
            extraTags: {
              newsletter_run_id: run.id,
              newsletter_post_id: run.post_id,
              publication_id: run.publication_id,
            },
            extraHeaders: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            skipSuppressionCheck: true,
            newsletterRunId: run.id,
            newsletterRecipientId: r.id,
          },
        );
        await env.DB.prepare(
          "UPDATE newsletter_run_recipients SET status='queued',email_id=?,accepted_at=?,updated_at=? WHERE id=? AND status='pending'",
        )
          .bind(result.id, nowIso(), nowIso(), r.id)
          .run();
      } catch (err) {
        const api = toApiError(err);
        if (api.type === "rate_limit_error") {
          // The recipient stays pending; its idempotency key makes the retry safe.
          return {
            state: "wait",
            delaySeconds: api.code === "daily_limit_exceeded" ? 900 : 30,
          };
        }
        console.error("newsletter recipient failed", { runId: run.id, recipientId: r.id, code: api.code });
        await env.DB.prepare(
          "UPDATE newsletter_run_recipients SET status='failed',skip_reason=?,updated_at=? WHERE id=? AND status='pending'",
        )
          .bind(api.code.slice(0, 100), nowIso(), r.id)
          .run();
      }
    }
  }
  const left = await one<{ n: number }>(
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM newsletter_run_recipients WHERE run_id=? AND status='pending'",
    ).bind(run.id),
  );
  if (left?.n) return { state: "more" };
  const now = nowIso();
  await env.DB.prepare(
    "UPDATE newsletter_email_runs SET status='sent',completed_at=?,updated_at=? WHERE id=? AND status='sending'",
  )
    .bind(now, now, run.id)
    .run();
  return { state: "done" };
}

/** Cron: start due scheduled runs, and re-enqueue sending runs whose queue message was lost. */
export async function advanceRuns(env: Env, time = Date.now()) {
  const now = new Date(time).toISOString();
  const due = await all<{ id: string }>(
    env.DB.prepare(
      "SELECT id FROM newsletter_email_runs WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 50",
    ).bind(now),
  );
  for (const r of due) {
    const started = await env.DB.prepare(
      "UPDATE newsletter_email_runs SET status='sending',started_at=?,updated_at=? WHERE id=? AND status='scheduled'",
    )
      .bind(now, now, r.id)
      .run();
    if (started.meta.changes)
      await env.NEWSLETTER_QUEUE.send({ kind: "newsletter-run", runId: r.id } satisfies RunMessage);
  }
  const stale = await all<{ id: string }>(
    env.DB.prepare(
      "SELECT r.id FROM newsletter_email_runs r WHERE r.status='sending' AND r.updated_at<? AND (r.lease_until IS NULL OR r.lease_until<?) AND EXISTS(SELECT 1 FROM newsletter_run_recipients x WHERE x.run_id=r.id AND x.status='pending') LIMIT 20",
    ).bind(new Date(time - 10 * 60_000).toISOString(), now),
  );
  for (const r of stale) {
    await env.DB.prepare("UPDATE newsletter_email_runs SET updated_at=? WHERE id=?")
      .bind(now, r.id)
      .run();
    await env.NEWSLETTER_QUEUE.send({ kind: "newsletter-run", runId: r.id } satisfies RunMessage);
  }
}

async function requireRun(env: Env, project: ProjectRow, publicationId: string, runId: string) {
  await requirePublication(env, project.id, publicationId);
  const run = await one<RunRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_email_runs WHERE id=? AND publication_id=? AND project_id=?",
    ).bind(runId, publicationId, project.id),
  );
  if (!run) throw ApiError.notFound("run_not_found", "This email was not found.");
  return run;
}

export async function cancelRun(env: Env, project: ProjectRow, publicationId: string, runId: string) {
  const run = await requireRun(env, project, publicationId, runId);
  if (!["scheduled", "sending"].includes(run.status))
    throw ApiError.conflict("not_cancelable", `This email is already ${run.status}.`);
  await cancelAll(env, run.id);
  return getRun(env, project, publicationId, runId);
}

interface Counts {
  processed: number;
  delivered: number;
  bounced: number;
  failed: number;
  skipped: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}
/** Counts for many runs with three grouped queries. */
async function countsFor(env: Env, runIds: string[]): Promise<Map<string, Counts>> {
  const out = new Map<string, Counts>();
  for (const id of runIds)
    out.set(id, { processed: 0, delivered: 0, bounced: 0, failed: 0, skipped: 0, opened: 0, clicked: 0, unsubscribed: 0 });
  if (!runIds.length) return out;
  const marks = runIds.map(() => "?").join(",");
  const emails = await all<{ run: string; delivered: number; bounced: number; failed: number; opened: number; clicked: number }>(
    env.DB.prepare(
      `SELECT newsletter_run_id AS run,
        SUM(CASE WHEN status IN ('delivered','complained') THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) AS bounced,
        SUM(CASE WHEN status IN ('failed','rejected') THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
        SUM(CASE WHEN first_clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked
       FROM emails WHERE newsletter_run_id IN (${marks}) GROUP BY newsletter_run_id`,
    ).bind(...runIds),
  );
  for (const e of emails) {
    const c = out.get(e.run)!;
    c.delivered = e.delivered;
    c.bounced = e.bounced;
    c.failed += e.failed;
    c.opened = e.opened;
    c.clicked = e.clicked;
  }
  const recipients = await all<{ run: string; status: string; n: number }>(
    env.DB.prepare(
      `SELECT run_id AS run,status,COUNT(*) AS n FROM newsletter_run_recipients WHERE run_id IN (${marks}) GROUP BY run_id,status`,
    ).bind(...runIds),
  );
  for (const r of recipients) {
    const c = out.get(r.run)!;
    if (r.status !== "pending") c.processed += r.n;
    if (r.status === "skipped") c.skipped += r.n;
    if (r.status === "failed") c.failed += r.n;
  }
  const unsubscribes = await all<{ run: string; n: number }>(
    env.DB.prepare(
      `SELECT json_extract(data_json,'$.runId') AS run,COUNT(*) AS n FROM newsletter_subscription_events WHERE type='unsubscribed' AND json_extract(data_json,'$.runId') IN (${marks}) GROUP BY run`,
    ).bind(...runIds),
  );
  for (const u of unsubscribes) out.get(u.run)!.unsubscribed = u.n;
  return out;
}

async function dailyLimitReached(env: Env, project: ProjectRow) {
  if (project.daily_limit <= 0) return false;
  const row = await one<{ count: number }>(
    env.DB.prepare("SELECT count FROM daily_counts WHERE project_id=? AND day=?").bind(project.id, utcDay()),
  );
  return (row?.count ?? 0) >= project.daily_limit;
}

function shape(run: RunRow, c: Counts, waiting: NewsletterEmailRun["waiting"]): NewsletterEmailRun {
  return {
    id: run.id,
    publicationId: run.publication_id,
    postId: run.post_id,
    revisionId: run.revision_id,
    subject: run.subject,
    status: run.status,
    scheduledAt: run.scheduled_at,
    scheduleTimezone: run.schedule_timezone,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    createdAt: run.created_at,
    total: run.total,
    ...c,
    waiting,
  };
}

async function toRun(env: Env, project: ProjectRow, run: RunRow): Promise<NewsletterEmailRun> {
  const counts = (await countsFor(env, [run.id])).get(run.id)!;
  const waiting =
    run.status === "sending" && counts.processed < run.total && (await dailyLimitReached(env, project))
      ? "daily_limit"
      : null;
  return shape(run, counts, waiting);
}

export async function getRun(
  env: Env,
  project: ProjectRow,
  publicationId: string,
  runId: string,
): Promise<NewsletterRunDetail> {
  const run = await requireRun(env, project, publicationId, runId);
  const links = await all<{ url: string; clicks: number }>(
    env.DB.prepare(
      "SELECT json_extract(ev.data,'$.url') AS url,COUNT(*) AS clicks FROM email_events ev JOIN emails e ON e.id=ev.email_id WHERE e.newsletter_run_id=? AND ev.type='email.clicked' GROUP BY url ORDER BY clicks DESC LIMIT 20",
    ).bind(run.id),
  );
  return { ...(await toRun(env, project, run)), links: links.filter((l) => !!l.url) };
}

export async function listRuns(
  env: Env,
  project: ProjectRow,
  publicationId: string,
  query: { postId?: string; limit?: number | string; cursor?: string } = {},
) {
  await requirePublication(env, project.id, publicationId);
  const where = ["publication_id=?", "project_id=?"];
  const args: unknown[] = [publicationId, project.id];
  if (query.postId) {
    where.push("post_id=?");
    args.push(query.postId);
  }
  pageClause(query.cursor, where, args);
  const n = limit(query);
  const rows = await all<RunRow>(
    env.DB.prepare(
      `SELECT * FROM newsletter_email_runs WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ?`,
    ).bind(...args, n + 1),
  );
  const page = paginate(rows, n);
  const counts = await countsFor(env, page.rows.map((r) => r.id));
  return {
    data: page.rows.map((r) => shape(r, counts.get(r.id)!, null)),
    nextCursor: page.nextCursor,
  };
}

/** The latest run per post, for post lists. Two queries for the whole page. */
export async function emailSummaries(
  env: Env,
  postIds: string[],
): Promise<Map<string, NewsletterEmailSummary>> {
  const out = new Map<string, NewsletterEmailSummary>();
  if (!postIds.length) return out;
  const runs = await all<RunRow>(
    env.DB.prepare(
      `SELECT r.* FROM newsletter_email_runs r WHERE r.post_id IN (${postIds.map(() => "?").join(",")}) AND r.created_at=(SELECT MAX(x.created_at) FROM newsletter_email_runs x WHERE x.post_id=r.post_id)`,
    ).bind(...postIds),
  );
  const counts = await countsFor(env, runs.map((r) => r.id));
  for (const r of runs) {
    const c = counts.get(r.id)!;
    out.set(r.post_id, {
      id: r.id,
      status: r.status,
      scheduledAt: r.scheduled_at,
      completedAt: r.completed_at,
      total: r.total,
      delivered: c.delivered,
      opened: c.opened,
      clicked: c.clicked,
    });
  }
  return out;
}

export async function latestRun(env: Env, project: ProjectRow, postId: string) {
  const run = await one<RunRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_email_runs WHERE post_id=? AND project_id=? ORDER BY created_at DESC LIMIT 1",
    ).bind(postId, project.id),
  );
  return run ? toRun(env, project, run) : null;
}

const RECIPIENT_STATUS: Record<string, NewsletterRunRecipient["status"]> = {
  delivered: "delivered",
  complained: "delivered",
  bounced: "bounced",
  failed: "failed",
  rejected: "failed",
  canceled: "canceled",
};

export async function listRunRecipients(
  env: Env,
  project: ProjectRow,
  publicationId: string,
  runId: string,
  query: { status?: string; q?: string; limit?: number | string; cursor?: string } = {},
) {
  const run = await requireRun(env, project, publicationId, runId);
  const where = ["r.run_id=?"];
  const args: unknown[] = [run.id];
  if (query.q) {
    where.push("r.address_snapshot LIKE ? ESCAPE '\\'");
    args.push(`%${likeEscape(query.q.toLowerCase())}%`);
  }
  const statusSql: Record<string, string> = {
    pending: "r.status='pending'",
    skipped: "r.status='skipped'",
    canceled: "r.status='canceled'",
    failed: "(r.status='failed' OR e.status IN ('failed','rejected'))",
    bounced: "e.status='bounced'",
    delivered: "e.status IN ('delivered','complained')",
    opened: "e.opened_at IS NOT NULL",
    clicked: "e.first_clicked_at IS NOT NULL",
  };
  if (query.status && statusSql[query.status]) where.push(statusSql[query.status]!);
  pageClause(query.cursor, where, args, "r");
  const n = limit(query);
  const rows = await all<RecipientRow & { email_status: string | null; opened_at: string | null; first_clicked_at: string | null }>(
    env.DB.prepare(
      `SELECT r.*,e.status AS email_status,e.opened_at,e.first_clicked_at FROM newsletter_run_recipients r LEFT JOIN emails e ON e.id=r.email_id WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC,r.id DESC LIMIT ?`,
    ).bind(...args, n + 1),
  );
  const page = paginate(rows, n);
  return {
    data: page.rows.map(
      (r): NewsletterRunRecipient => ({
        id: r.id,
        email: r.address_snapshot ?? "(deleted)",
        emailId: r.email_id,
        status: r.email_status
          ? (RECIPIENT_STATUS[r.email_status] ?? (r.email_status === "queued" ? "queued" : "sent"))
          : (r.status as NewsletterRunRecipient["status"]),
        openedAt: r.opened_at,
        clickedAt: r.first_clicked_at,
      }),
    ),
    nextCursor: page.nextCursor,
  };
}

const TestInput = z
  .object({
    to: z.array(z.string().trim().toLowerCase().email()).min(1).max(5),
    subscriptionId: z.string().max(100).optional(),
  })
  .strict();

/** Sends the current draft to up to five addresses. No run, no recipients, normal suppression check. */
export async function sendTest(
  env: Env,
  project: ProjectRow,
  publicationId: string,
  postId: string,
  raw: unknown,
) {
  const input = parse(TestInput, raw);
  const p = await requirePublication(env, project.id, publicationId);
  active(project, p);
  await requireSender(env, project, p);
  const post = await requirePost(env, project.id, publicationId, postId);
  const snapshot = await revision(env, post);
  const meta = JSON.parse(snapshot.row.metadata_json) as RenderMeta;
  const values = input.subscriptionId
    ? await getSubscriber(env, project, publicationId, input.subscriptionId)
    : { firstName: "Ada", lastName: "Lovelace" };
  const out = renderFor(env, snapshot.document, meta, values, publicationUrl(env, project, p));
  let sent = 0;
  for (const to of input.to) {
    await sendEmail(
      env,
      { project, mode: "live", source: "broadcast", apiKeyId: null },
      {
        from: sender(p),
        to,
        ...(p.reply_to ? { replyTo: p.reply_to } : {}),
        subject: `[Test] ${meta.subject || post.subject || post.title}`,
        html: out.html,
        text: out.text,
        trackOpens: false,
        trackClicks: false,
      },
      { purpose: "newsletter", extraTags: { newsletter_test: postId } },
    );
    sent++;
  }
  return { sent };
}

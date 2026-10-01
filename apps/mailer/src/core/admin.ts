// Admin operations shared by /v1/admin/* and AdminRpc.
import {
  CreateApiKeyInput, CreateProjectInput, CreateSuppressionInput, UpdateApiKeyInput, UpdateProjectInput, parseDisplayAddress,
  domainOf, formatDisplayAddress,
  type ApiKeyRecord, type CreatedApiKey, type ListResponse, type ProjectRecord, type SendEmailResult, type StatsRecord, type SuppressionRecord,
} from "@flaresend/types";
import type { z } from "zod";
import { getApiKeyById, insertApiKey, listApiKeys, renameApiKey, revokeApiKey, toApiKeyRecord } from "../db/api-keys";
import { all } from "../db/client";
import { getEmailById } from "../db/emails";
import { domainSenders, getProjectById, getProjectBySlug, insertProject, listProjects, toProjectRecord, updateProject, type ProjectRow } from "../db/projects";
import { deleteSuppression, getSuppression, listSuppressions, toSuppressionRecord, upsertSuppressionStmt } from "../db/suppressions";
import { ApiError } from "../http/errors";
import { getPayload, type PayloadAddress } from "../storage/payloads";
import { newId, nowIso } from "./ids";
import { generateApiKey } from "./keys";
import { sendEmail } from "./send";

export const SUPPRESSION_NOTE =
  "This is Flaresend's local mirror. Cloudflare keeps its own suppression list; edit that one in the Cloudflare dashboard (Email Service).";

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw ApiError.fromZod(r.error);
  return r.data;
}

function checkDefaultFrom(defaultFrom: string | null | undefined, domains: string[], param = "defaultFrom"): string | null {
  if (!defaultFrom) return null;
  let p;
  try {
    p = parseDisplayAddress(defaultFrom);
  } catch {
    throw ApiError.validation("invalid_body", `${param} is not a valid address`, param);
  }
  if (!domains.includes(domainOf(p.address))) {
    throw ApiError.validation("invalid_body", `${param} must be on ${domains.length === 1 ? domains[0] : `one of ${domains.join(", ")}`}`, param);
  }
  return formatDisplayAddress(p);
}

/**
 * Applies `changes` to the stored per-domain senders (null removes one) and drops domains no longer allowed.
 * Each sender must be an address on its own domain. Returns the JSON to store, or null when none are left.
 */
function mergeDomainSenders(stored: Record<string, string>, changes: Record<string, string | null> | null | undefined, domains: string[]): string | null {
  const out: Record<string, string> = changes === null ? {} : { ...stored };
  for (const [raw, value] of Object.entries(changes ?? {})) {
    const domain = raw.trim().toLowerCase();
    const param = `domainSenders.${domain}`;
    if (!domains.includes(domain)) throw ApiError.validation("invalid_body", `${domain} is not one of this project's domains`, param);
    const sender = checkDefaultFrom(value, [domain], param);
    if (sender) out[domain] = sender;
    else delete out[domain];
  }
  for (const d of Object.keys(out)) if (!domains.includes(d)) delete out[d];
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

// ---------- projects ----------

export async function requireProjectBySlug(env: Env, slug: string): Promise<ProjectRow> {
  const p = await getProjectBySlug(env.DB, slug);
  if (!p) throw ApiError.notFound("project_not_found", `project "${slug}" not found`, "slug");
  return p;
}

export async function createProject(env: Env, raw: unknown): Promise<ProjectRecord> {
  const input = parse(CreateProjectInput, raw);
  if (await getProjectBySlug(env.DB, input.slug)) {
    throw ApiError.conflict("slug_taken", `a project with slug "${input.slug}" already exists`, "slug");
  }
  const domains = [...new Set(input.allowedDomains)];
  const now = nowIso();
  const row: ProjectRow = {
    id: newId("proj"),
    slug: input.slug,
    name: input.name,
    default_from: checkDefaultFrom(input.defaultFrom, domains),
    allowed_domains: JSON.stringify(domains),
    allowed_senders: input.allowedSenders ? JSON.stringify([...new Set(input.allowedSenders)]) : null,
    domain_senders: mergeDomainSenders({}, input.domainSenders, domains),
    rpc_enabled: input.rpcEnabled === false ? 0 : 1,
    daily_limit: input.dailyLimit ?? 5000,
    track_opens: input.trackOpens ? 1 : 0,
    track_clicks: input.trackClicks ? 1 : 0,
    broadcasts_enabled: input.broadcastsEnabled ? 1 : 0,
    created_at: now,
    updated_at: now,
    disabled_at: null,
  };
  await insertProject(env.DB, row);
  return toProjectRecord(row);
}

export async function listProjectRecords(env: Env): Promise<ProjectRecord[]> {
  return (await listProjects(env.DB)).map(toProjectRecord);
}

export async function getProjectRecord(env: Env, slug: string): Promise<ProjectRecord> {
  return toProjectRecord(await requireProjectBySlug(env, slug));
}

export async function patchProject(env: Env, slug: string, raw: unknown): Promise<ProjectRecord> {
  const p = await requireProjectBySlug(env, slug);
  const input = parse(UpdateProjectInput, raw);
  const domains = input.allowedDomains ? [...new Set(input.allowedDomains)] : (JSON.parse(p.allowed_domains) as string[]);
  const patch: Parameters<typeof updateProject>[2] = { updated_at: nowIso() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.allowedDomains !== undefined) patch.allowed_domains = JSON.stringify(domains);
  if (input.defaultFrom !== undefined) patch.default_from = checkDefaultFrom(input.defaultFrom, domains);
  else if (input.allowedDomains !== undefined && p.default_from) checkDefaultFrom(p.default_from, domains);
  if (input.domainSenders !== undefined || input.allowedDomains !== undefined) {
    patch.domain_senders = mergeDomainSenders(domainSenders(p), input.domainSenders, domains);
  }
  if (input.allowedSenders !== undefined) patch.allowed_senders = input.allowedSenders ? JSON.stringify([...new Set(input.allowedSenders)]) : null;
  if (input.rpcEnabled !== undefined) patch.rpc_enabled = input.rpcEnabled ? 1 : 0;
  if (input.dailyLimit !== undefined) patch.daily_limit = input.dailyLimit;
  if (input.trackOpens !== undefined) patch.track_opens = input.trackOpens ? 1 : 0;
  if (input.trackClicks !== undefined) patch.track_clicks = input.trackClicks ? 1 : 0;
  if (input.broadcastsEnabled !== undefined) patch.broadcasts_enabled = input.broadcastsEnabled ? 1 : 0;
  if (input.disabled !== undefined) patch.disabled_at = input.disabled ? (p.disabled_at ?? nowIso()) : null;
  await updateProject(env.DB, p.id, patch);
  return toProjectRecord((await getProjectById(env.DB, p.id))!);
}

export async function disableProject(env: Env, slug: string): Promise<ProjectRecord> {
  return patchProject(env, slug, { disabled: true });
}

// ---------- API keys ----------

export async function createApiKey(env: Env, slug: string, raw: unknown): Promise<CreatedApiKey> {
  const project = await requireProjectBySlug(env, slug);
  const input = parse(CreateApiKeyInput, raw);
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
    throw ApiError.validation("invalid_body", "expiresAt must be in the future", "expiresAt");
  }
  const { key, prefix, hash } = await generateApiKey(input.mode);
  const row = {
    id: newId("key"),
    project_id: project.id,
    name: input.name,
    mode: input.mode,
    key_prefix: prefix,
    key_hash: hash,
    last_used_at: null,
    created_at: nowIso(),
    revoked_at: null,
    expires_at: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
  };
  await insertApiKey(env.DB, row);
  return { ...toApiKeyRecord(row), key };
}

export async function listApiKeyRecords(env: Env, slug?: string | null): Promise<ApiKeyRecord[]> {
  const projectId = slug ? (await requireProjectBySlug(env, slug)).id : undefined;
  return (await listApiKeys(env.DB, projectId)).map(toApiKeyRecord);
}

async function requireKey(env: Env, id: string) {
  const k = await getApiKeyById(env.DB, id);
  if (!k) throw ApiError.notFound("api_key_not_found", `API key ${id} not found`, "id");
  return k;
}

export async function renameKey(env: Env, id: string, raw: unknown): Promise<ApiKeyRecord> {
  await requireKey(env, id);
  const { name } = parse(UpdateApiKeyInput, raw);
  await renameApiKey(env.DB, id, name);
  return toApiKeyRecord((await getApiKeyById(env.DB, id))!);
}

export async function revokeKey(env: Env, id: string): Promise<ApiKeyRecord> {
  await requireKey(env, id);
  await revokeApiKey(env.DB, id, nowIso());
  return toApiKeyRecord((await getApiKeyById(env.DB, id))!);
}

// ---------- suppressions ----------

export async function listSuppressionRecords(
  env: Env,
  q: { limit?: number | string; cursor?: string; q?: string },
): Promise<ListResponse<SuppressionRecord> & { note: string }> {
  const limit = Math.min(Math.max(Number(q.limit ?? 50) || 50, 1), 200);
  const { rows, nextCursor } = await listSuppressions(env.DB, { limit, cursor: q.cursor, q: q.q });
  return { data: rows.map(toSuppressionRecord), nextCursor, note: SUPPRESSION_NOTE };
}

export async function addSuppression(env: Env, raw: unknown): Promise<SuppressionRecord & { note: string }> {
  const input = parse(CreateSuppressionInput, raw);
  await upsertSuppressionStmt(env.DB, { address: input.address, reason: input.reason, source_email_id: null, created_at: nowIso() }).run();
  return { ...toSuppressionRecord((await getSuppression(env.DB, input.address))!), note: SUPPRESSION_NOTE };
}

export async function removeSuppression(env: Env, address: string): Promise<{ address: string; deleted: boolean; note: string }> {
  const a = address.trim().toLowerCase();
  const r = await deleteSuppression(env.DB, a);
  return { address: a, deleted: r.meta.changes > 0, note: SUPPRESSION_NOTE };
}

// ---------- stats ----------

export async function getStats(env: Env): Promise<StatsRecord[]> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const d7 = new Date(now - 7 * 86400_000).toISOString();
  const d30 = new Date(now - 30 * 86400_000).toISOString();
  const rows = await all<{ project_id: string; status: string; today: number; d7: number; d30: number }>(
    env.DB.prepare(
      `SELECT project_id, status,
              SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS today,
              SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS d7,
              COUNT(*) AS d30
       FROM emails WHERE created_at >= ?3 GROUP BY project_id, status`,
    ).bind(today, d7, d30),
  );
  const projects = await listProjects(env.DB);
  return projects.map((p) => {
    const rec: StatsRecord = { projectId: p.id, slug: p.slug, name: p.name, today: {}, last7d: {}, last30d: {} };
    for (const r of rows.filter((r) => r.project_id === p.id)) {
      if (r.today) rec.today[r.status] = r.today;
      if (r.d7) rec.last7d[r.status] = r.d7;
      if (r.d30) rec.last30d[r.status] = r.d30;
    }
    return rec;
  });
}

// ---------- resend ----------

function display(a: PayloadAddress): string {
  return typeof a === "string" ? a : formatDisplayAddress({ address: a.email, name: a.name });
}

/** Re-sends the stored R2 payload as a new email, tagged resent_from=<id>. */
export async function resendEmail(env: Env, id: string, projectId: string | null, waitUntil?: (p: Promise<unknown>) => void): Promise<SendEmailResult> {
  const email = await getEmailById(env.DB, id, projectId);
  if (!email) throw ApiError.notFound("email_not_found", `email ${id} not found`, "id");
  if (email.purpose === "subscription_confirmation") throw ApiError.conflict("confirmation_resend_required", "Request a new confirmation link through the subscription form.");
  const project = await getProjectById(env.DB, email.project_id);
  if (!project) throw ApiError.notFound("project_not_found", "project not found");
  if (project.disabled_at) throw ApiError.permission("project_disabled", "this project is disabled");
  const p = await getPayload(env, id);
  if (!p) throw ApiError.notFound("content_expired", "the email body is no longer stored, so it cannot be resent", "id");
  const tags = JSON.parse(email.tags ?? "{}") as Record<string, string>;
  const input = {
    from: display(p.fromName ? { email: p.from, name: p.fromName } : p.from),
    to: p.to.map(display),
    ...(p.cc.length ? { cc: p.cc.map(display) } : {}),
    ...(p.bcc.length ? { bcc: p.bcc.map(display) } : {}),
    ...(p.replyTo ? { replyTo: display(p.replyTo) } : {}),
    subject: p.subject,
    ...(p.html ? { html: p.html } : {}),
    ...(p.text ? { text: p.text } : {}),
    ...(Object.keys(p.headers).length ? { headers: p.headers } : {}),
    ...(p.attachments.length ? { attachments: p.attachments } : {}),
    tags: { ...tags, resent_from: id },
  };
  return sendEmail(env, { project, mode: "live", source: "http", apiKeyId: null, waitUntil }, input);
}

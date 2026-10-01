// Broadcasts: one email to every subscribed contact in an audience, sent in chunks by the cron.
// Flaresend does not limit how a person sends. BROADCAST_MAX_RECIPIENTS is an optional operator cap (0 = none).
import {
  CreateBroadcastInput, formatDisplayAddress, SendBroadcastInput, UpdateBroadcastInput,
  type BroadcastRecord,
} from "@flaresend/types";
import type { z } from "zod";
import { broadcastMaxRecipients, publicBaseUrl } from "../env";
import { all, one, parseJson } from "../db/client";
import { toBroadcastRecord, type BroadcastRow, type ContactRow } from "../db/contacts";
import { getProjectById, type ProjectRow } from "../db/projects";
import { findSuppressed } from "../db/suppressions";
import { ApiError, toApiError } from "../http/errors";
import { requireAudience, unsubscribeToken } from "./contacts";
import { newId, nowIso } from "./ids";
import { renderMustache } from "./mustache";
import { sendEmail } from "./send";
import { resolveSender, validateSchedule } from "./validate";

export const BROADCAST_CHUNK = 100;

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw ApiError.fromZod(r.error);
  return r.data;
}

async function requireBroadcast(env: Env, projectId: string, id: string): Promise<BroadcastRow> {
  const b = await one<BroadcastRow>(env.DB.prepare("SELECT * FROM broadcasts WHERE id = ? AND project_id = ?").bind(id, projectId));
  if (!b) throw ApiError.notFound("broadcast_not_found", `broadcast ${id} not found`, "id");
  return b;
}

export async function broadcastCounts(env: Env, projectId: string, id: string): Promise<Record<string, number>> {
  const rows = await all<{ status: string; n: number }>(
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM emails WHERE project_id = ? AND json_extract(tags, '$.broadcast_id') = ? GROUP BY status").bind(projectId, id),
  );
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export async function listBroadcasts(env: Env, projectId: string): Promise<BroadcastRecord[]> {
  const rows = await all<BroadcastRow>(env.DB.prepare("SELECT * FROM broadcasts WHERE project_id = ? ORDER BY created_at DESC").bind(projectId));
  return rows.map((b) => toBroadcastRecord(b));
}

export async function getBroadcast(env: Env, projectId: string, id: string): Promise<BroadcastRecord> {
  const b = await requireBroadcast(env, projectId, id);
  return toBroadcastRecord(b, await broadcastCounts(env, projectId, id));
}

export async function createBroadcast(env: Env, project: ProjectRow, raw: unknown): Promise<BroadcastRecord> {
  const input = parse(CreateBroadcastInput, raw);
  await requireAudience(env, project.id, input.audienceId);
  const sender = resolveSender(input.from, project);
  const now = nowIso();
  const row: BroadcastRow = {
    id: newId("bc"), project_id: project.id, audience_id: input.audienceId, from_address: sender.address, from_name: sender.name,
    subject: input.subject, html: input.html, text: input.text ?? null, status: "draft", scheduled_at: null, started_at: null,
    completed_at: null, cursor: null, total: 0, sent: 0, created_at: now, updated_at: now,
  };
  await env.DB.prepare(
    `INSERT INTO broadcasts (id, project_id, audience_id, from_address, from_name, subject, html, text, status, scheduled_at, started_at, completed_at, cursor, total, sent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.id, row.project_id, row.audience_id, row.from_address, row.from_name, row.subject, row.html, row.text, row.status,
    row.scheduled_at, row.started_at, row.completed_at, row.cursor, row.total, row.sent, row.created_at, row.updated_at,
  ).run();
  return toBroadcastRecord(row);
}

export async function patchBroadcast(env: Env, project: ProjectRow, id: string, raw: unknown): Promise<BroadcastRecord> {
  const b = await requireBroadcast(env, project.id, id);
  if (b.status !== "draft") throw ApiError.conflict("broadcast_not_draft", "only draft broadcasts can be edited", "id");
  const input = parse(UpdateBroadcastInput, raw);
  if (input.audienceId) await requireAudience(env, project.id, input.audienceId);
  const sender = input.from ? resolveSender(input.from, project) : { address: b.from_address, name: b.from_name };
  await env.DB.prepare(
    "UPDATE broadcasts SET audience_id = ?, from_address = ?, from_name = ?, subject = ?, html = ?, text = ?, updated_at = ? WHERE id = ?",
  ).bind(
    input.audienceId ?? b.audience_id, sender.address, sender.name, input.subject ?? b.subject, input.html ?? b.html,
    input.text === undefined ? b.text : input.text, nowIso(), id,
  ).run();
  return getBroadcast(env, project.id, id);
}

export async function removeBroadcast(env: Env, projectId: string, id: string): Promise<{ id: string; deleted: true }> {
  const b = await requireBroadcast(env, projectId, id);
  if (b.status === "sending" || b.status === "scheduled") {
    throw ApiError.conflict("broadcast_active", "cancel the broadcast before deleting it", "id");
  }
  await env.DB.prepare("DELETE FROM broadcasts WHERE id = ?").bind(id).run();
  return { id, deleted: true };
}

export async function countEligible(env: Env, audienceId: string): Promise<number> {
  const r = await one<{ n: number }>(
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audience_contacts ac JOIN contacts c ON c.id = ac.contact_id WHERE ac.audience_id = ? AND c.unsubscribed = 0",
    ).bind(audienceId),
  );
  return r?.n ?? 0;
}

export async function startBroadcast(env: Env, project: ProjectRow, id: string, raw: unknown): Promise<BroadcastRecord> {
  const b = await requireBroadcast(env, project.id, id);
  if (b.status !== "draft") throw ApiError.conflict("broadcast_not_draft", `broadcast is ${b.status}, not draft`, "id");
  const { scheduledAt } = parse(SendBroadcastInput, raw ?? {});
  const at = validateSchedule(scheduledAt);
  const total = await countEligible(env, b.audience_id);
  if (total === 0) throw ApiError.validation("invalid_body", "the audience has no subscribed contacts");
  const max = broadcastMaxRecipients(env);
  if (max > 0 && total > max) {
    throw ApiError.validation("too_many_recipients", `broadcasts are capped at ${max} recipients; this audience has ${total}`);
  }
  const now = nowIso();
  await env.DB.prepare("UPDATE broadcasts SET status = ?, scheduled_at = ?, started_at = ?, total = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
    .bind(at ? "scheduled" : "sending", at?.toISOString() ?? null, at ? null : now, total, now, id)
    .run();
  return getBroadcast(env, project.id, id);
}

export async function cancelBroadcast(env: Env, projectId: string, id: string): Promise<BroadcastRecord> {
  const b = await requireBroadcast(env, projectId, id);
  if (!["draft", "scheduled", "sending"].includes(b.status)) {
    throw ApiError.conflict("not_cancelable", `broadcast is already ${b.status}`, "id");
  }
  await env.DB.prepare("UPDATE broadcasts SET status = 'canceled', updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
  return getBroadcast(env, projectId, id);
}

/** One cron tick for one broadcast: send up to BROADCAST_CHUNK emails after `cursor`. */
export async function processBroadcastChunk(env: Env, b: BroadcastRow): Promise<{ sent: number; done: boolean }> {
  const project = await getProjectById(env.DB, b.project_id);
  if (!project || project.disabled_at) {
    await env.DB.prepare("UPDATE broadcasts SET status = 'canceled', updated_at = ? WHERE id = ?").bind(nowIso(), b.id).run();
    return { sent: 0, done: true };
  }
  const contacts = await all<ContactRow>(
    env.DB.prepare(
      `SELECT c.* FROM audience_contacts ac JOIN contacts c ON c.id = ac.contact_id
       WHERE ac.audience_id = ? AND c.id > ? ORDER BY c.id LIMIT ?`,
    ).bind(b.audience_id, b.cursor ?? "", BROADCAST_CHUNK),
  );
  const suppressed = new Set((await findSuppressed(env.DB, contacts.map((c) => c.email))).map((s) => s.address));
  const base = publicBaseUrl(env);
  const from = formatDisplayAddress({ address: b.from_address, name: b.from_name });
  let cursor = b.cursor;
  let sent = 0;
  let stopped = false;

  for (const c of contacts) {
    if (c.unsubscribed === 1 || suppressed.has(c.email)) {
      cursor = c.id;
      continue;
    }
    const data: Record<string, unknown> = { ...parseJson<Record<string, unknown>>(c.data, {}), first_name: c.first_name ?? "", last_name: c.last_name ?? "", email: c.email };
    const headers: Record<string, string> = {};
    if (env.TRACKING_SECRET) {
      const url = `${base}/u/${await unsubscribeToken(env.TRACKING_SECRET, c.id)}`;
      headers["List-Unsubscribe"] = `<${url}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      data["unsubscribe_url"] = url;
    }
    try {
      await sendEmail(
        env,
        { project, mode: "live", source: "broadcast", apiKeyId: null },
        {
          from,
          to: c.email,
          subject: renderMustache(b.subject, data, { escape: false }),
          html: renderMustache(b.html, data),
          ...(b.text ? { text: renderMustache(b.text, data, { escape: false }) } : {}),
        },
        { idempotencyKey: `bc:${b.id}:${c.id}`, extraTags: { broadcast_id: b.id }, extraHeaders: headers, skipSuppressionCheck: true },
      );
      sent++;
      cursor = c.id;
    } catch (err) {
      const api = toApiError(err);
      if (api.type === "rate_limit_error") {
        // Stop here; the next tick resumes from this contact.
        console.warn("broadcast paused by rate limit", { broadcastId: b.id, code: api.code });
        stopped = true;
        break;
      }
      console.error("broadcast: skipping contact", { broadcastId: b.id, contactId: c.id, code: api.code, message: api.message });
      cursor = c.id;
    }
  }

  const done = !stopped && contacts.length < BROADCAST_CHUNK;
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE broadcasts SET cursor = ?, sent = sent + ?, updated_at = ?,
       status = CASE WHEN status = 'sending' AND ? THEN 'sent' ELSE status END,
       completed_at = CASE WHEN status = 'sending' AND ? THEN ? ELSE completed_at END
     WHERE id = ?`,
  ).bind(cursor, sent, now, done ? 1 : 0, done ? 1 : 0, now, b.id).run();
  return { sent, done };
}

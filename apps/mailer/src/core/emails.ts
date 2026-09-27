// Read/cancel/reschedule operations on emails, shared by HTTP routes, MailerRpc and AdminRpc.
import {
  ListEmailsQuery, ListEventsQuery,
  type EmailContent, type EmailRecord, type EventRecord, type ListResponse, type ParsedListEmailsQuery,
} from "@flaresend/types";
import { getEmailById, listEmails, toEmailRecord, type EmailRow } from "../db/emails";
import { insertEventStmt, listEvents, listEventsForEmail, toEventRecord } from "../db/events";
import { listRecipients, listRecipientsForEmails, type RecipientRow } from "../db/recipients";
import { ApiError } from "../http/errors";
import { enqueueSend, MAX_QUEUE_DELAY_SECONDS } from "../queue/producer";
import { base64ByteLength, getPayload, getTrackedHtml } from "../storage/payloads";
import { enqueueWebhooksSafe } from "../webhooks/deliver";
import { newId, nowIso } from "./ids";
import { validateSchedule } from "./validate";

export async function loadEmail(env: Env, id: string, projectId: string | null): Promise<EmailRow> {
  const email = await getEmailById(env.DB, id, projectId);
  if (!email) throw ApiError.notFound("email_not_found", `email ${id} not found`, "id");
  return email;
}

export async function getEmailRecord(env: Env, id: string, projectId: string | null): Promise<EmailRecord> {
  const email = await loadEmail(env, id, projectId);
  const [recipients, events] = await Promise.all([listRecipients(env.DB, id), listEventsForEmail(env.DB, id)]);
  return toEmailRecord(email, recipients, events);
}

export function parseListEmailsQuery(raw: unknown): ParsedListEmailsQuery {
  const r = ListEmailsQuery.safeParse(raw ?? {});
  if (!r.success) throw ApiError.fromZod(r.error, "invalid_query");
  return r.data;
}

/** Lists include recipients but not the event timeline (events: []); fetch one email for its timeline. */
export async function listEmailRecords(env: Env, q: ParsedListEmailsQuery, projectId: string | null): Promise<ListResponse<EmailRecord>> {
  const { rows, nextCursor } = await listEmails(env.DB, { ...q, projectId });
  const recipients = await listRecipientsForEmails(env.DB, rows.map((r) => r.id));
  const byEmail = new Map<string, RecipientRow[]>();
  for (const r of recipients) {
    const list = byEmail.get(r.email_id) ?? [];
    list.push(r);
    byEmail.set(r.email_id, list);
  }
  return { data: rows.map((e) => toEmailRecord(e, byEmail.get(e.id) ?? [], [])), nextCursor };
}

export async function getEmailContent(env: Env, id: string, projectId: string | null): Promise<EmailContent> {
  await loadEmail(env, id, projectId);
  const payload = await getPayload(env, id);
  if (!payload) throw ApiError.notFound("content_expired", "the email body is no longer stored (bodies are kept for 30 days)", "id");
  return {
    html: payload.html,
    text: payload.text,
    trackedHtml: await getTrackedHtml(env, id),
    headers: payload.headers,
    attachments: payload.attachments.map((a) => ({ filename: a.filename, type: a.type ?? null, size: base64ByteLength(a.content) })),
  };
}

export async function listEventRecords(env: Env, raw: unknown, projectId: string | null): Promise<ListResponse<EventRecord>> {
  const r = ListEventsQuery.safeParse(raw ?? {});
  if (!r.success) throw ApiError.fromZod(r.error, "invalid_query");
  const { rows, nextCursor } = await listEvents(env.DB, { ...r.data, projectId });
  return { data: rows.map(toEventRecord), nextCursor };
}

/** Phase 3: cancel a scheduled email. Anything else -> 409 not_cancelable. */
export async function cancelEmail(env: Env, id: string, projectId: string | null): Promise<{ id: string; status: "canceled" }> {
  const email = await loadEmail(env, id, projectId);
  if (email.status !== "scheduled") {
    throw ApiError.conflict("not_cancelable", `only scheduled emails can be canceled; this one is ${email.status}`, "id");
  }
  const now = nowIso();
  const ev = {
    id: newId("evt"), email_id: id, project_id: email.project_id, recipient: null, type: "email.canceled",
    cloudflare_event_id: null, data: null, created_at: now,
  };
  // The follow-up statements only apply if the guarded UPDATE won (the send consumer may have claimed it first).
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE emails SET status = 'canceled' WHERE id = ? AND status = 'scheduled'").bind(id),
    env.DB.prepare(
      "UPDATE email_recipients SET status = 'canceled' WHERE email_id = ?1 AND EXISTS (SELECT 1 FROM emails WHERE id = ?1 AND status = 'canceled')",
    ).bind(id),
    env.DB.prepare(
      `INSERT INTO email_events (id, email_id, project_id, recipient, type, cloudflare_event_id, data, created_at)
       SELECT ?1, ?2, ?3, NULL, 'email.canceled', NULL, NULL, ?4 WHERE EXISTS (SELECT 1 FROM emails WHERE id = ?2 AND status = 'canceled')`,
    ).bind(ev.id, id, email.project_id, now),
  ]);
  if (results[0]!.meta.changes !== 1) {
    throw ApiError.conflict("not_cancelable", "the email is already being sent", "id");
  }
  await enqueueWebhooksSafe(env, email.project_id, [ev], email);
  return { id, status: "canceled" };
}

/** Phase 3: move a scheduled email. The already-queued message (if any) re-checks scheduled_at and waits. */
export async function rescheduleEmail(env: Env, id: string, scheduledAtRaw: string, projectId: string | null): Promise<EmailRecord> {
  const email = await loadEmail(env, id, projectId);
  if (email.status !== "scheduled") {
    throw ApiError.conflict("not_cancelable", `only scheduled emails can be rescheduled; this one is ${email.status}`, "id");
  }
  const at = validateSchedule(scheduledAtRaw)!;
  const delay = (at.getTime() - Date.now()) / 1000;
  const enqueueNow = delay <= MAX_QUEUE_DELAY_SECONDS;
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE emails SET scheduled_at = ?, enqueued_at = ? WHERE id = ? AND status = 'scheduled'")
      .bind(at.toISOString(), enqueueNow ? now : null, id),
    insertEventStmt(env.DB, {
      id: newId("evt"), email_id: id, project_id: email.project_id, recipient: null, type: "email.scheduled",
      cloudflare_event_id: null, data: JSON.stringify({ scheduledAt: at.toISOString(), rescheduled: true }), created_at: now,
    }),
  ]);
  if (enqueueNow) {
    await enqueueSend(env, { body: { kind: "send", emailId: id, projectId: email.project_id, attempt: 0 }, delaySeconds: Math.ceil(delay) });
  }
  return getEmailRecord(env, id, projectId);
}

// Consumes flaresend-events: Cloudflare Email Service delivery events.
import { CfEmailEventSchema, type EmailStatus } from "@flaresend/types";
import { all } from "../db/client";
import { getEmailById, getEmailByMessageId, type EmailRow } from "../db/emails";
import { eventExists, insertEventStmt, type EventRow } from "../db/events";
import { upsertSuppressionStmt } from "../db/suppressions";
import { newId, nowIso } from "../core/ids";
import { recipientNoDowngradeSql, REDUCE_EMAIL_STATUS_SQL } from "../core/status";
import { enqueueWebhooksSafe } from "../webhooks/deliver";

export type EventOutcome =
  | { kind: "processed"; emailId: string; status: EmailStatus; eventId: string }
  | { kind: "duplicate" }
  | { kind: "invalid"; reason: string }
  | { kind: "not_found" };

type ParsedEvent = ReturnType<typeof CfEmailEventSchema.parse>;

function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String((err as Error)?.message ?? err));
}

/**
 * Applies one Cloudflare event. Returns `not_found` when no email has this messageId yet;
 * the caller decides whether to retry or park it in orphan_events.
 */
export async function applyCfEvent(env: Env, raw: unknown): Promise<EventOutcome> {
  // 1. Validate.
  const parsed = CfEmailEventSchema.safeParse(raw);
  if (!parsed.success) return { kind: "invalid", reason: parsed.error.issues[0]?.message ?? "invalid event" };
  const ev: ParsedEvent = parsed.data;
  const p = ev.payload;

  // 2. Dedupe.
  if (await eventExists(env.DB, p.eventId)) return { kind: "duplicate" };

  // 3. Find the email.
  const email = await getEmailByMessageId(env.DB, p.messageId);
  if (!email) return { kind: "not_found" };

  const at = ev.metadata.eventTimestamp;
  const address = p.recipient.trim().toLowerCase();
  const incoming = p.delivery.status;
  const stmts: D1PreparedStatement[] = [];

  // 4. Recipient row (create defensively if missing, so the event is never lost).
  stmts.push(
    env.DB.prepare(
      `INSERT OR IGNORE INTO email_recipients (id, email_id, address, kind, status) VALUES (?, ?, ?, 'to', 'sent')`,
    ).bind(newId("rcpt"), email.id, address),
  );

  // 5. Update the recipient unless this would downgrade it (checked in SQL, inside the transaction).
  const d = p.delivery;
  stmts.push(
    env.DB.prepare(
      `UPDATE email_recipients SET status = ?1,
         provider = COALESCE(?2, provider), smtp_status = COALESCE(?3, smtp_status), smtp_response = COALESCE(?4, smtp_response),
         delivery_ms = COALESCE(?5, delivery_ms), bounce_type = COALESCE(?6, bounce_type), last_event_at = ?7
       WHERE email_id = ?8 AND address = ?9 AND ${recipientNoDowngradeSql()}`,
    ).bind(
      incoming,
      d.provider ?? null,
      d.smtpEnhancedStatusCode ?? (d.smtpStatusCode != null ? String(d.smtpStatusCode) : null),
      d.smtpResponse ?? null,
      d.deliveryTimeMs ?? null,
      p.bounce?.type ?? null,
      at,
      email.id,
      address,
    ),
  );

  // 6. Timeline event.
  const row: EventRow = {
    id: newId("evt"),
    email_id: email.id,
    project_id: email.project_id,
    recipient: address,
    type: `email.${incoming}`,
    cloudflare_event_id: p.eventId,
    data: JSON.stringify({
      delivery: p.delivery,
      ...(p.bounce ? { bounce: p.bounce } : {}),
      ...(p.failure ? { failure: p.failure } : {}),
      ...(p.rejection ? { rejection: p.rejection } : {}),
      ...(p.complaint ? { complaint: p.complaint } : {}),
      terminal: p.terminal ?? null,
    }),
    created_at: at,
  };
  stmts.push(insertEventStmt(env.DB, row));

  // 7. Email status: reduceEmailStatus's rules, evaluated in SQL over the rows as they are inside this transaction.
  stmts.push(env.DB.prepare(REDUCE_EMAIL_STATUS_SQL).bind(email.id, at));

  // 8. Suppression mirror.
  if ((incoming === "bounced" && p.bounce?.type === "hard") || incoming === "complained") {
    stmts.push(
      upsertSuppressionStmt(env.DB, {
        address,
        reason: incoming === "complained" ? "complaint" : "hard_bounce",
        source_email_id: email.id,
        created_at: nowIso(),
      }),
    );
  }

  // All writes for one event in one batch (transaction).
  try {
    await env.DB.batch(stmts);
  } catch (err) {
    if (isUniqueViolation(err) && (await eventExists(env.DB, p.eventId))) return { kind: "duplicate" };
    throw err;
  }

  // 9. Webhooks.
  await enqueueWebhooksSafe(env, email.project_id, [row], summary(email));
  const after = await getEmailById(env.DB, email.id);
  return { kind: "processed", emailId: email.id, status: (after?.status ?? email.status) as EmailStatus, eventId: row.id };
}

function summary(e: EmailRow) {
  return { id: e.id, from_address: e.from_address, subject: e.subject, tags: e.tags };
}

export const ORPHAN_RETRY_ATTEMPTS = 6;

export async function parkOrphan(env: Env, raw: unknown): Promise<void> {
  const p = (raw as { payload?: { eventId?: string; messageId?: string } })?.payload;
  if (!p?.eventId || !p.messageId) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO orphan_events (cloudflare_event_id, cloudflare_message_id, raw, received_at) VALUES (?, ?, ?, ?)",
  ).bind(p.eventId, p.messageId, JSON.stringify(raw), nowIso()).run();
}

/** Called by the send consumer right after it records a messageId. */
export async function replayOrphans(env: Env, messageId: string): Promise<number> {
  const rows = await all<{ cloudflare_event_id: string; raw: string }>(
    env.DB.prepare("SELECT cloudflare_event_id, raw FROM orphan_events WHERE cloudflare_message_id = ? ORDER BY received_at").bind(messageId),
  );
  let n = 0;
  for (const r of rows) {
    try {
      const out = await applyCfEvent(env, JSON.parse(r.raw));
      if (out.kind === "not_found") continue;
      await env.DB.prepare("DELETE FROM orphan_events WHERE cloudflare_event_id = ?").bind(r.cloudflare_event_id).run();
      n++;
    } catch (err) {
      console.error("orphan replay failed", { eventId: r.cloudflare_event_id, err: String(err) });
    }
  }
  return n;
}

export async function processEventMessage(msg: Message<unknown>, env: Env): Promise<void> {
  const body = msg.body as { type?: unknown };
  if (typeof body?.type !== "string" || !body.type.startsWith("cf.email.sending.message.")) {
    console.warn("events: ignoring unknown message", { type: body?.type });
    msg.ack();
    return;
  }
  const out = await applyCfEvent(env, msg.body);
  switch (out.kind) {
    case "processed":
    case "duplicate":
      msg.ack();
      return;
    case "invalid":
      console.warn("events: invalid event", { reason: out.reason });
      msg.ack();
      return;
    case "not_found":
      if (msg.attempts < ORPHAN_RETRY_ATTEMPTS) {
        msg.retry({ delaySeconds: 10 * msg.attempts });
      } else {
        await parkOrphan(env, msg.body);
        msg.ack();
      }
      return;
  }
}

export async function handleEventsBatch(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processEventMessage(msg, env);
    } catch (err) {
      console.error("events: unexpected error", { err: String(err) });
      msg.retry({ delaySeconds: 30 });
    }
  }
}

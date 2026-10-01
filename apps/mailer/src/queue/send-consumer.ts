// Consumes flaresend-send.
import type { SendQueueMessage } from "../env";
import { getEmailById, type EmailRow } from "../db/emails";
import { insertEventStmt, type EventRow } from "../db/events";
import { upsertSuppressionStmt } from "../db/suppressions";
import { newId, nowIso } from "../core/ids";
import { sendViaCloudflare } from "../core/provider";
import { applyTracking } from "../core/tracking";
import { getPayload } from "../storage/payloads";
import { enqueueWebhooksSafe } from "../webhooks/deliver";
import { MAX_QUEUE_DELAY_SECONDS } from "./producer";
import { replayOrphans } from "./events-consumer";
import { confirmationEligible } from "../core/newsletters/subscriptions";

const RETRYABLE = new Set(["E_RATE_LIMIT_EXCEEDED", "E_INTERNAL_SERVER_ERROR", "E_DELIVERY_FAILED"]);

export function errorCode(err: unknown): string | null {
  const code = (err as { code?: unknown })?.code;
  if (typeof code === "string" && code) return code;
  const m = /\b(E_[A-Z0-9_]+)\b/.exec(String((err as Error)?.message ?? ""));
  return m ? m[1]! : null;
}

export function errorMessage(err: unknown): string {
  return String((err as Error)?.message ?? err).slice(0, 1000);
}

/** min(2^attempt * 15, 3600) seconds plus up to 20% jitter. */
export function backoffSeconds(attempt: number, random = Math.random): number {
  const base = Math.min(2 ** attempt * 15, 3600);
  return Math.round(base + base * 0.2 * random());
}

export type SendDecision =
  | { kind: "retry"; delaySeconds: number }
  | { kind: "fail"; status: "failed" | "rejected" };

export function classifySendError(code: string | null, attempt: number): SendDecision {
  if (code === null || RETRYABLE.has(code)) return { kind: "retry", delaySeconds: backoffSeconds(attempt) };
  if (code === "E_DAILY_LIMIT_EXCEEDED") return { kind: "retry", delaySeconds: 3600 };
  return { kind: "fail", status: code === "E_RECIPIENT_SUPPRESSED" ? "rejected" : "failed" };
}

function summary(e: EmailRow) {
  return { id: e.id, from_address: e.from_address, subject: e.subject, tags: e.tags };
}

function event(e: EmailRow, type: string, data: unknown, at = nowIso()): EventRow {
  return {
    id: newId("evt"), email_id: e.id, project_id: e.project_id, recipient: null, type,
    cloudflare_event_id: null, data: data == null ? null : JSON.stringify(data), created_at: at,
  };
}

async function failEmail(env: Env, email: EmailRow, status: "failed" | "rejected", code: string, message: string): Promise<EventRow> {
  const now = nowIso();
  const ev = event(email, "email.failed", { code, message }, now);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE emails SET status = ?, last_error_code = ?, last_error_message = ?, failed_at = COALESCE(failed_at, ?) WHERE id = ?",
    ).bind(status, code, message, now, email.id),
    env.DB.prepare("UPDATE email_recipients SET status = ?, last_event_at = ? WHERE email_id = ?").bind(status, now, email.id),
    insertEventStmt(env.DB, ev),
  ]);
  return ev;
}

export async function processSendMessage(msg: Message<SendQueueMessage>, env: Env): Promise<void> {
  const { emailId } = msg.body;

  // 1. Load and skip anything already handled or canceled.
  const email = await getEmailById(env.DB, emailId);
  if (!email || !["queued", "sending", "scheduled"].includes(email.status)) {
    console.log("send: skipping", { emailId, status: email?.status ?? "missing" });
    msg.ack();
    return;
  }
  if (email.purpose === "subscription_confirmation" && !await confirmationEligible(env, email.newsletter_token_hash ?? "")) {
    await failEmail(env, email, "rejected", "confirmation_expired", "This confirmation request is no longer active.");
    msg.ack();
    return;
  }

  // 2. Scheduled for later (rescheduled, or delivered early): wait.
  if (email.scheduled_at) {
    const diff = (new Date(email.scheduled_at).getTime() - Date.now()) / 1000;
    if (diff > 60) {
      msg.retry({ delaySeconds: Math.ceil(Math.min(diff, MAX_QUEUE_DELAY_SECONDS)) });
      return;
    }
  }

  // 3. Claim. Only one message may move an email to `sending` (guards against duplicate scheduled messages).
  //    A redelivery after a crash (status still `sending`) may re-claim.
  const claim = await env.DB.prepare(
    `UPDATE emails SET status = 'sending', attempts = attempts + 1
     WHERE id = ? AND (status IN ('queued','scheduled') OR (status = 'sending' AND ? > 1))`,
  ).bind(emailId, msg.attempts).run();
  if (claim.meta.changes !== 1) {
    msg.ack();
    return;
  }

  // 4. Payload.
  const payload = await getPayload(env, emailId);
  if (!payload) {
    const ev = await failEmail(env, email, "failed", "payload_missing", "the email body was not found in R2");
    await enqueueWebhooksSafe(env, email.project_id, [ev], summary(email));
    msg.ack();
    return;
  }

  try {
    // 5. Tracking.
    const html = await applyTracking(env, email, payload.html);

    // 6. Send.
    if (email.purpose === "subscription_confirmation" && !await confirmationEligible(env, email.newsletter_token_hash ?? "")) {
      await failEmail(env,email,"rejected","confirmation_expired","This confirmation request is no longer active.");
      msg.ack();return;
    }
    const { messageId } = await sendViaCloudflare(env, payload, emailId, html);

    // 7. Success.
    const now = nowIso();
    const ev = event(email, "email.sent", { messageId }, now);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE emails SET status = 'sent', cloudflare_message_id = ?, sent_at = ?, last_error_code = NULL, last_error_message = NULL WHERE id = ?",
      ).bind(messageId, now, emailId),
      env.DB.prepare("UPDATE email_recipients SET status = 'sent' WHERE email_id = ? AND status IN ('queued','sending')").bind(emailId),
      insertEventStmt(env.DB, ev),
    ]);
    msg.ack();
    await enqueueWebhooksSafe(env, email.project_id, [ev], summary(email));
    await replayOrphans(env, messageId);
  } catch (err) {
    // 8. Errors.
    const code = errorCode(err);
    const message = errorMessage(err);
    const decision = classifySendError(code, msg.attempts);
    if (decision.kind === "retry") {
      console.warn("send: retrying", { emailId, code, message, attempt: msg.attempts, delay: decision.delaySeconds });
      await env.DB.batch([
        env.DB.prepare("UPDATE emails SET status = 'queued', last_error_code = ?, last_error_message = ? WHERE id = ?")
          .bind(code ?? "network_error", message, emailId),
        insertEventStmt(env.DB, event(email, "email.retrying", { code: code ?? "network_error", message, attempt: msg.attempts, delaySeconds: decision.delaySeconds })),
      ]);
      msg.retry({ delaySeconds: decision.delaySeconds });
      return;
    }
    console.error("send: failed", { emailId, code, message });
    const ev = await failEmail(env, email, decision.status, code!, message);
    if (code === "E_RECIPIENT_SUPPRESSED") {
      const now = nowIso();
      const recipients = [...JSON.parse(email.to_addresses), ...JSON.parse(email.cc_addresses), ...JSON.parse(email.bcc_addresses)] as string[];
      await env.DB.batch(recipients.map((address) =>
        upsertSuppressionStmt(env.DB, { address, reason: "hard_bounce", source_email_id: email.id, created_at: now }),
      ));
    }
    msg.ack();
    await enqueueWebhooksSafe(env, email.project_id, [ev], summary(email));
  }
}

export async function handleSendBatch(batch: MessageBatch<SendQueueMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processSendMessage(msg, env);
    } catch (err) {
      // Unexpected (D1/R2 failure). Retry this message only.
      console.error("send: unexpected error", { emailId: msg.body?.emailId, err: String(err) });
      msg.retry({ delaySeconds: backoffSeconds(msg.attempts) });
    }
  }
}

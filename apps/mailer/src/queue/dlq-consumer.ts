// Consumes flaresend-dlq. Messages carry a `kind` (send/webhook) or are Cloudflare events (`type`).
import { newId, nowIso } from "../core/ids";
import { insertEventStmt } from "../db/events";
import { getEmailById } from "../db/emails";
import { parkOrphan } from "./events-consumer";

export async function processDlqMessage(msg: Message<unknown>, env: Env): Promise<void> {
  const body = msg.body as { kind?: string; emailId?: string; deliveryId?: string; type?: string };

  if (body?.kind === "send" && body.emailId) {
    const email = await getEmailById(env.DB, body.emailId);
    if (email && ["queued", "sending", "scheduled"].includes(email.status)) {
      const now = nowIso();
      const message = "the send was retried the maximum number of times";
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE emails SET status = 'failed', last_error_code = 'max_retries_exhausted', last_error_message = ?, failed_at = COALESCE(failed_at, ?) WHERE id = ?",
        ).bind(message, now, email.id),
        env.DB.prepare("UPDATE email_recipients SET status = 'failed', last_event_at = ? WHERE email_id = ?").bind(now, email.id),
        insertEventStmt(env.DB, {
          id: newId("evt"), email_id: email.id, project_id: email.project_id, recipient: null, type: "email.failed",
          cloudflare_event_id: null, data: JSON.stringify({ code: "max_retries_exhausted", message }), created_at: now,
        }),
      ]);
    }
    console.error("dlq: send exhausted retries", { emailId: body.emailId });
  } else if (body?.kind === "webhook" && body.deliveryId) {
    await env.DB.prepare(
      "UPDATE webhook_deliveries SET status = 'failed', next_attempt_at = NULL, completed_at = ? WHERE id = ? AND status = 'pending'",
    ).bind(nowIso(), body.deliveryId).run();
    console.error("dlq: webhook delivery exhausted retries", { deliveryId: body.deliveryId });
  } else if (typeof body?.type === "string" && body.type.startsWith("cf.email.")) {
    // Keep it so it can be replayed if the email turns up.
    await parkOrphan(env, body);
    console.error("dlq: cloudflare event", JSON.stringify(body));
  } else {
    console.error("dlq: unknown message", JSON.stringify(body));
  }
  msg.ack();
}

export async function handleDlqBatch(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processDlqMessage(msg, env);
    } catch (err) {
      console.error("dlq: failed to process", { err: String(err), body: JSON.stringify(msg.body) });
      msg.ack(); // max_retries is 0 on the DLQ; never loop.
    }
  }
}

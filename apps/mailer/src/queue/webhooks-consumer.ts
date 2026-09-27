// Consumes flaresend-webhooks.
import type { WebhookQueueMessage } from "../env";
import { getDelivery, getWebhook, updateDelivery } from "../db/webhooks";
import { nowIso } from "../core/ids";
import { signatureHeader } from "../webhooks/sign";
import { retryDelayFor } from "../webhooks/deliver";

export const WEBHOOK_TIMEOUT_MS = 10_000;

export async function deliverOnce(
  url: string,
  secret: string,
  deliveryId: string,
  eventId: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number | null; body: string | null }> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Flaresend-Webhooks/1.0",
        "Flaresend-Event-Id": eventId,
        "Flaresend-Delivery-Id": deliveryId,
        "Flaresend-Signature": await signatureHeader(secret, body),
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      redirect: "manual",
    });
    const text = (await res.text().catch(() => "")).slice(0, 1024);
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body: text };
  } catch (err) {
    const name = (err as Error)?.name;
    const message = name === "TimeoutError" || name === "AbortError" ? `timeout after ${WEBHOOK_TIMEOUT_MS / 1000}s` : String((err as Error)?.message ?? err);
    return { ok: false, status: null, body: message.slice(0, 1024) };
  }
}

export async function processWebhookMessage(msg: Message<WebhookQueueMessage>, env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const delivery = await getDelivery(env.DB, msg.body.deliveryId);
  if (!delivery || delivery.status !== "pending") {
    msg.ack();
    return;
  }
  const hook = await getWebhook(env.DB, delivery.webhook_id);
  if (!hook || hook.enabled !== 1) {
    await updateDelivery(env.DB, delivery.id, {
      attempt: delivery.attempt, status: "failed", response_code: null,
      response_body: hook ? "webhook disabled" : "webhook deleted", next_attempt_at: null, completed_at: nowIso(),
    });
    msg.ack();
    return;
  }

  const attempt = delivery.attempt + 1;
  const r = await deliverOnce(hook.url, hook.secret, delivery.id, delivery.event_id, delivery.payload, fetchImpl);
  if (r.ok) {
    await updateDelivery(env.DB, delivery.id, {
      attempt, status: "success", response_code: r.status, response_body: r.body, next_attempt_at: null, completed_at: nowIso(),
    });
    msg.ack();
    return;
  }

  const delay = retryDelayFor(attempt);
  await updateDelivery(env.DB, delivery.id, {
    attempt, status: "pending", response_code: r.status, response_body: r.body,
    next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(), completed_at: null,
  });
  // After max_retries (8) the message goes to the DLQ, which marks the delivery failed.
  msg.retry({ delaySeconds: delay });
}

export async function handleWebhooksBatch(batch: MessageBatch<WebhookQueueMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processWebhookMessage(msg, env);
    } catch (err) {
      console.error("webhooks: unexpected error", { deliveryId: msg.body?.deliveryId, err: String(err) });
      msg.retry({ delaySeconds: 60 });
    }
  }
}

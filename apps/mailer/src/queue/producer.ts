// Thin wrapper over the queue producer bindings. Everything goes through the `queueOps` object so tests can
// vi.spyOn(queueOps, ...) — vi.mock does not reach modules the Workers test pool has already loaded.
import type { SendQueueMessage, WebhookQueueMessage } from "../env";

export const MAX_QUEUE_DELAY_SECONDS = 43_200; // Queues cap delays at 12 h

export interface SendJob {
  body: SendQueueMessage;
  delaySeconds?: number;
}

async function sendImpl(env: Env, job: SendJob): Promise<void> {
  await env.SEND_QUEUE.send(job.body, job.delaySeconds ? { delaySeconds: clampDelay(job.delaySeconds) } : undefined);
}

async function sendBatchImpl(env: Env, jobs: SendJob[]): Promise<void> {
  for (let i = 0; i < jobs.length; i += 100) {
    await env.SEND_QUEUE.sendBatch(
      jobs.slice(i, i + 100).map((j) => ({ body: j.body, ...(j.delaySeconds ? { delaySeconds: clampDelay(j.delaySeconds) } : {}) })),
    );
  }
}

async function webhookImpl(env: Env, deliveryIds: string[], delaySeconds?: number): Promise<void> {
  for (let i = 0; i < deliveryIds.length; i += 100) {
    await env.WEBHOOK_QUEUE.sendBatch(
      deliveryIds.slice(i, i + 100).map((deliveryId) => ({
        body: { kind: "webhook", deliveryId } satisfies WebhookQueueMessage,
        ...(delaySeconds ? { delaySeconds: clampDelay(delaySeconds) } : {}),
      })),
    );
  }
}

export function clampDelay(s: number): number {
  return Math.max(0, Math.min(MAX_QUEUE_DELAY_SECONDS, Math.ceil(s)));
}

export const queueOps = {
  send: sendImpl,
  sendBatch: sendBatchImpl,
  webhooks: webhookImpl,
};

export const enqueueSend = (env: Env, job: SendJob) => queueOps.send(env, job);
export const enqueueSendBatch = (env: Env, jobs: SendJob[]) => queueOps.sendBatch(env, jobs);
export const enqueueWebhookDeliveries = (env: Env, deliveryIds: string[], delaySeconds?: number) => queueOps.webhooks(env, deliveryIds, delaySeconds);

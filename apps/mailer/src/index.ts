import type { SendQueueMessage, WebhookQueueMessage } from "./env";
import { QUEUE_NAMES } from "./env";
import { app } from "./http/app";
import {
  handleNewsletterBatch,
  type NewsletterQueueMessage,
} from "./queue/newsletters-consumer";
import { runScheduled } from "./cron/scheduled";
import { handleDlqBatch } from "./queue/dlq-consumer";
import { handleEventsBatch } from "./queue/events-consumer";
import { handleSendBatch } from "./queue/send-consumer";
import { handleWebhooksBatch } from "./queue/webhooks-consumer";

export { MailerRpc } from "./rpc";
export { AdminRpc } from "./rpc-admin";

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    switch (batch.queue) {
      case QUEUE_NAMES.newsletters:
        return handleNewsletterBatch(
          batch as MessageBatch<NewsletterQueueMessage>,
          env,
        );
      case QUEUE_NAMES.send:
        return handleSendBatch(batch as MessageBatch<SendQueueMessage>, env);
      case QUEUE_NAMES.events:
        return handleEventsBatch(batch, env);
      case QUEUE_NAMES.webhooks:
        return handleWebhooksBatch(
          batch as MessageBatch<WebhookQueueMessage>,
          env,
        );
      case QUEUE_NAMES.dlq:
        return handleDlqBatch(batch, env);
      default:
        console.error("unknown queue", batch.queue);
        batch.retryAll({ delaySeconds: 300 });
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runScheduled(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;

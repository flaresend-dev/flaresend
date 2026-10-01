import { processImport } from "../core/newsletters/imports";
import { processRun, type RunMessage } from "../core/newsletters/delivery";
export type NewsletterQueueMessage =
  | { kind: "newsletter-import"; importId: string }
  | RunMessage;
export async function handleNewsletterBatch(
  batch: MessageBatch<NewsletterQueueMessage>,
  env: Env,
) {
  for (const msg of batch.messages) {
    try {
      if (msg.body.kind === "newsletter-import") {
        const more = await processImport(env, msg.body.importId);
        if (more) await env.NEWSLETTER_QUEUE.send(msg.body);
        msg.ack();
      } else if (msg.body.kind === "newsletter-run") {
        const result = await processRun(env, msg.body.runId);
        if (result.state === "more") {
          await env.NEWSLETTER_QUEUE.send(msg.body);
          msg.ack();
        } else if (result.state === "wait") {
          // The project's own rate or daily limit. The recipient stays pending.
          msg.retry({ delaySeconds: result.delaySeconds });
        } else msg.ack();
      } else msg.ack();
    } catch (e) {
      console.error("newsletter queue message failed", {
        body: msg.body,
        error: String(e),
      });
      msg.retry({ delaySeconds: Math.min(300, 2 ** msg.attempts * 15) });
    }
  }
}

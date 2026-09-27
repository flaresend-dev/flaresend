// POST /v1/emails/batch and MailerRpc.sendBatch.
import type { ApiErrorShape, BatchDryRunResult, BatchItemResult, BatchResult } from "@flaresend/types";
import { ApiError, toApiError } from "../http/errors";
import { enqueueSendBatch, type SendJob } from "../queue/producer";
import { markQueueError, prepareEmail, sendEmailInternal, type SendContext } from "./send";

export const MAX_BATCH = 100;

export interface BatchOptions {
  /** Whole-batch key; stored per item as `<key>:<index>` unless the item has its own key. */
  idempotencyKey?: string;
  dryRun?: boolean;
}

function checkBatchShape(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) throw ApiError.validation("invalid_body", "body must be a JSON array of emails");
  if (raw.length === 0) throw ApiError.validation("invalid_body", "batch is empty");
  if (raw.length > MAX_BATCH) throw ApiError.validation("invalid_body", `at most ${MAX_BATCH} emails per batch`);
  return raw;
}

function itemKey(item: unknown, index: number, batchKey?: string): string | undefined {
  const own = (item as { idempotencyKey?: unknown })?.idempotencyKey;
  if (typeof own === "string" && own) return own;
  return batchKey ? `${batchKey}:${index}` : undefined;
}

function errorOf(err: unknown): { error: ApiErrorShape } {
  const api = toApiError(err);
  if (api.type === "internal_error") console.error("batch item failed", err);
  return { error: api.toJSON() };
}

export async function sendBatch(env: Env, ctx: SendContext, raw: unknown, opts: BatchOptions = {}): Promise<BatchResult | BatchDryRunResult> {
  const items = checkBatchShape(raw);

  if (opts.dryRun) {
    const data: BatchDryRunResult["data"] = [];
    for (const item of items) {
      try {
        const p = await prepareEmail(env, ctx, item);
        data.push({
          ok: true,
          from: p.sender.address,
          to: p.recipients.to.map((r) => r.address),
          cc: p.recipients.cc.map((r) => r.address),
          bcc: p.recipients.bcc.map((r) => r.address),
          subject: p.subject,
        });
      } catch (err) {
        data.push(errorOf(err));
      }
    }
    return { dryRun: true, data };
  }

  const data: BatchItemResult[] = [];
  const jobs: Array<{ index: number; job: SendJob }> = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const out = await sendEmailInternal(env, ctx, items[i], { idempotencyKey: itemKey(items[i], i, opts.idempotencyKey), deferQueue: true });
      data.push(out.result);
      if (out.job) jobs.push({ index: i, job: out.job });
    } catch (err) {
      data.push(errorOf(err));
    }
  }

  if (jobs.length) {
    try {
      await enqueueSendBatch(env, jobs.map((j) => j.job));
    } catch (err) {
      for (const j of jobs) {
        await markQueueError(env, j.job.body.emailId, ctx.project.id, err).catch(() => {});
        data[j.index] = { error: ApiError.internal("could not queue the email; it was not sent").toJSON() };
      }
    }
  }
  return { data };
}

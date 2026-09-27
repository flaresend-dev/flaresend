// Webhook CRUD shared by /v1/webhooks, /v1/admin/projects/:slug/webhooks and AdminRpc.
import {
  CreateWebhookInput, UpdateWebhookInput,
  type ListResponse, type WebhookDeliveryRecord, type WebhookRecord,
} from "@flaresend/types";
import type { z } from "zod";
import {
  deleteWebhook, getWebhook, insertDeliveryStmt, insertWebhook, listDeliveries, listWebhooks,
  toDeliveryRecord, toWebhookRecord, updateWebhook, type WebhookRow,
} from "../db/webhooks";
import { ApiError } from "../http/errors";
import { enqueueWebhookDeliveries } from "../queue/producer";
import { generateWebhookSecret } from "../webhooks/sign";
import { newId, nowIso, randomBase62 } from "./ids";

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw ApiError.fromZod(r.error);
  return r.data;
}

async function requireWebhook(env: Env, projectId: string, id: string): Promise<WebhookRow> {
  const w = await getWebhook(env.DB, id, projectId);
  if (!w) throw ApiError.notFound("webhook_not_found", `webhook ${id} not found`, "id");
  return w;
}

export async function createWebhook(env: Env, projectId: string, raw: unknown): Promise<WebhookRecord> {
  const input = parse(CreateWebhookInput, raw);
  const now = nowIso();
  const row: WebhookRow = {
    id: newId("wh"), project_id: projectId, url: input.url, secret: generateWebhookSecret(),
    events: JSON.stringify([...new Set(input.events)]), enabled: input.enabled ? 1 : 0, created_at: now, updated_at: now,
  };
  await insertWebhook(env.DB, row);
  return toWebhookRecord(row, true);
}

export async function listWebhookRecords(env: Env, projectId: string): Promise<WebhookRecord[]> {
  return (await listWebhooks(env.DB, projectId)).map((w) => toWebhookRecord(w));
}

export async function getWebhookRecord(env: Env, projectId: string, id: string): Promise<WebhookRecord> {
  return toWebhookRecord(await requireWebhook(env, projectId, id));
}

export async function patchWebhook(env: Env, projectId: string, id: string, raw: unknown): Promise<WebhookRecord> {
  await requireWebhook(env, projectId, id);
  const input = parse(UpdateWebhookInput, raw);
  const patch: Parameters<typeof updateWebhook>[2] = { updated_at: nowIso() };
  if (input.url !== undefined) patch.url = input.url;
  if (input.events !== undefined) patch.events = JSON.stringify([...new Set(input.events)]);
  if (input.enabled !== undefined) patch.enabled = input.enabled ? 1 : 0;
  await updateWebhook(env.DB, id, patch);
  return getWebhookRecord(env, projectId, id);
}

export async function removeWebhook(env: Env, projectId: string, id: string): Promise<{ id: string; deleted: true }> {
  await requireWebhook(env, projectId, id);
  await deleteWebhook(env.DB, id);
  return { id, deleted: true };
}

export async function rotateWebhookSecret(env: Env, projectId: string, id: string): Promise<WebhookRecord> {
  await requireWebhook(env, projectId, id);
  await updateWebhook(env.DB, id, { secret: generateWebhookSecret(), updated_at: nowIso() });
  return toWebhookRecord((await getWebhook(env.DB, id))!, true);
}

/** Sends a synthetic email.delivered event to this one webhook (even if disabled events filter would skip it). */
export async function testWebhook(env: Env, projectId: string, id: string): Promise<{ deliveryId: string }> {
  const w = await requireWebhook(env, projectId, id);
  if (w.enabled !== 1) throw ApiError.conflict("webhook_disabled", "enable the webhook before sending a test event", "id");
  const now = nowIso();
  const eventId = `evt_test_${randomBase62(16)}`;
  const payload = {
    id: eventId,
    type: "email.delivered",
    createdAt: now,
    data: {
      test: true,
      emailId: "email_test",
      recipient: "recipient@example.com",
      from: "sender@example.com",
      subject: "Flaresend test event",
      tags: {},
      delivery: { status: "delivered", provider: "test", deliveryTimeMs: 1234, smtpStatusCode: "250", smtpResponse: "250 2.0.0 OK" },
    },
  };
  const deliveryId = newId("whd");
  await insertDeliveryStmt(env.DB, {
    id: deliveryId, webhook_id: id, event_id: eventId, event_type: "email.delivered", payload: JSON.stringify(payload),
    attempt: 0, status: "pending", response_code: null, response_body: null, next_attempt_at: now, created_at: now, completed_at: null,
  }).run();
  await enqueueWebhookDeliveries(env, [deliveryId]);
  return { deliveryId };
}

export async function listWebhookDeliveries(
  env: Env,
  projectId: string,
  id: string,
  q: { limit?: string | number; cursor?: string },
): Promise<ListResponse<WebhookDeliveryRecord>> {
  await requireWebhook(env, projectId, id);
  const limit = Math.min(Math.max(Number(q.limit ?? 25) || 25, 1), 100);
  const { rows, nextCursor } = await listDeliveries(env.DB, id, { limit, cursor: q.cursor });
  return { data: rows.map(toDeliveryRecord), nextCursor };
}

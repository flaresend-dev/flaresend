import type { WebhookDeliveryRecord, WebhookRecord } from "@flaresend/types";
import { all, bool, one, pageClause, paginate, parseJson } from "./client";

export interface WebhookRow {
  id: string;
  project_id: string;
  url: string;
  secret: string;
  events: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRow {
  id: string;
  webhook_id: string;
  event_id: string;
  event_type: string | null;
  payload: string;
  attempt: number;
  status: "pending" | "success" | "failed";
  response_code: number | null;
  response_body: string | null;
  next_attempt_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export function toWebhookRecord(w: WebhookRow, withSecret = false): WebhookRecord {
  return {
    id: w.id,
    projectId: w.project_id,
    url: w.url,
    events: parseJson<string[]>(w.events, ["*"]),
    enabled: bool(w.enabled),
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    ...(withSecret ? { secret: w.secret } : {}),
  };
}

export function toDeliveryRecord(d: DeliveryRow): WebhookDeliveryRecord {
  return {
    id: d.id,
    webhookId: d.webhook_id,
    eventId: d.event_id,
    eventType: d.event_type,
    attempt: d.attempt,
    status: d.status,
    responseCode: d.response_code,
    responseBody: d.response_body,
    nextAttemptAt: d.next_attempt_at,
    createdAt: d.created_at,
    completedAt: d.completed_at,
  };
}

export function insertWebhook(db: D1Database, w: WebhookRow) {
  return db
    .prepare("INSERT INTO webhooks (id, project_id, url, secret, events, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(w.id, w.project_id, w.url, w.secret, w.events, w.enabled, w.created_at, w.updated_at)
    .run();
}

export function getWebhook(db: D1Database, id: string, projectId?: string) {
  if (projectId) return one<WebhookRow>(db.prepare("SELECT * FROM webhooks WHERE id = ? AND project_id = ?").bind(id, projectId));
  return one<WebhookRow>(db.prepare("SELECT * FROM webhooks WHERE id = ?").bind(id));
}

export function listWebhooks(db: D1Database, projectId: string) {
  return all<WebhookRow>(db.prepare("SELECT * FROM webhooks WHERE project_id = ? ORDER BY created_at ASC").bind(projectId));
}

export function listEnabledWebhooks(db: D1Database, projectId: string) {
  return all<WebhookRow>(db.prepare("SELECT * FROM webhooks WHERE project_id = ? AND enabled = 1").bind(projectId));
}

export function updateWebhook(db: D1Database, id: string, patch: Partial<Pick<WebhookRow, "url" | "events" | "enabled" | "secret">> & { updated_at: string }) {
  const keys = (["url", "events", "enabled", "secret", "updated_at"] as const).filter((k) => k in patch);
  return db.prepare(`UPDATE webhooks SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).bind(...keys.map((k) => patch[k]), id).run();
}

export function deleteWebhook(db: D1Database, id: string) {
  return db.batch([
    db.prepare("DELETE FROM webhook_deliveries WHERE webhook_id = ?").bind(id),
    db.prepare("DELETE FROM webhooks WHERE id = ?").bind(id),
  ]);
}

export function insertDeliveryStmt(db: D1Database, d: DeliveryRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_id, event_type, payload, attempt, status, response_code, response_body, next_attempt_at, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(d.id, d.webhook_id, d.event_id, d.event_type, d.payload, d.attempt, d.status, d.response_code, d.response_body, d.next_attempt_at, d.created_at, d.completed_at);
}

export function getDelivery(db: D1Database, id: string) {
  return one<DeliveryRow>(db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").bind(id));
}

export function updateDelivery(
  db: D1Database,
  id: string,
  patch: Pick<DeliveryRow, "attempt" | "status" | "response_code" | "response_body" | "next_attempt_at" | "completed_at">,
) {
  return db
    .prepare(
      "UPDATE webhook_deliveries SET attempt = ?, status = ?, response_code = ?, response_body = ?, next_attempt_at = ?, completed_at = ? WHERE id = ?",
    )
    .bind(patch.attempt, patch.status, patch.response_code, patch.response_body, patch.next_attempt_at, patch.completed_at, id)
    .run();
}

export async function listDeliveries(db: D1Database, webhookId: string, q: { limit: number; cursor?: string }) {
  const where = ["webhook_id = ?"];
  const params: unknown[] = [webhookId];
  pageClause(q.cursor, where, params);
  const rows = await all<DeliveryRow>(
    db.prepare(`SELECT * FROM webhook_deliveries WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...params, q.limit + 1),
  );
  return paginate(rows, q.limit);
}

import { WEBHOOK_EVENT_TYPES, type WebhookPayload } from "@flaresend/types";
import { batch, parseJson } from "../db/client";
import type { EventRow } from "../db/events";
import { insertDeliveryStmt, listEnabledWebhooks, type DeliveryRow, type WebhookRow } from "../db/webhooks";
import { newId, nowIso } from "../core/ids";
import { enqueueWebhookDeliveries } from "../queue/producer";

const SUBSCRIBABLE = new Set<string>(WEBHOOK_EVENT_TYPES);

/** Retry schedule after a failed attempt n (1-based): 30 s, 2 m, 10 m, 30 m, 1 h, 3 h, 6 h, 12 h. */
export const WEBHOOK_RETRY_SCHEDULE = [30, 120, 600, 1800, 3600, 10800, 21600, 43200];

export function retryDelayFor(attempt: number): number {
  return WEBHOOK_RETRY_SCHEDULE[Math.min(Math.max(attempt, 1), WEBHOOK_RETRY_SCHEDULE.length) - 1]!;
}

export function webhookMatches(w: Pick<WebhookRow, "events">, type: string): boolean {
  const events = parseJson<string[]>(w.events, ["*"]);
  return events.includes("*") || events.includes(type);
}

export interface EmailSummary {
  id: string;
  from_address: string;
  subject: string;
  tags: string | null;
}

export function buildWebhookPayload(ev: Pick<EventRow, "id" | "type" | "recipient" | "data" | "created_at">, email: EmailSummary): WebhookPayload {
  const data = parseJson<Record<string, unknown> | null>(ev.data, null) ?? {};
  return {
    id: ev.id,
    type: ev.type,
    createdAt: ev.created_at,
    data: {
      ...data,
      emailId: email.id,
      recipient: ev.recipient,
      from: email.from_address,
      subject: email.subject,
      tags: parseJson<Record<string, string>>(email.tags, {}),
    },
  };
}

/**
 * Fan-out: for each new timeline event, create a pending delivery per matching enabled
 * webhook and enqueue it. Cheap when the project has no webhooks (one SELECT).
 */
export async function enqueueWebhooks(env: Env, projectId: string, events: EventRow[], email: EmailSummary): Promise<number> {
  const relevant = events.filter((e) => SUBSCRIBABLE.has(e.type));
  if (relevant.length === 0) return 0;
  const hooks = await listEnabledWebhooks(env.DB, projectId);
  if (hooks.length === 0) return 0;

  const rows: DeliveryRow[] = [];
  const now = nowIso();
  for (const ev of relevant) {
    const payload = JSON.stringify(buildWebhookPayload(ev, email));
    for (const w of hooks) {
      if (!webhookMatches(w, ev.type)) continue;
      rows.push({
        id: newId("whd"), webhook_id: w.id, event_id: ev.id, event_type: ev.type, payload,
        attempt: 0, status: "pending", response_code: null, response_body: null, next_attempt_at: now, created_at: now, completed_at: null,
      });
    }
  }
  if (rows.length === 0) return 0;
  await batch(env.DB, rows.map((r) => insertDeliveryStmt(env.DB, r)));
  await enqueueWebhookDeliveries(env, rows.map((r) => r.id));
  return rows.length;
}

/** Never let webhook fan-out break the caller. */
export async function enqueueWebhooksSafe(env: Env, projectId: string, events: EventRow[], email: EmailSummary): Promise<void> {
  try {
    await enqueueWebhooks(env, projectId, events, email);
  } catch (err) {
    console.error("webhook fan-out failed", { projectId, events: events.map((e) => e.id), err: String(err) });
  }
}

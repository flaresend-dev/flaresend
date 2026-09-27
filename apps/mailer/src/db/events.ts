import type { EventRecord } from "@flaresend/types";
import { all, one, pageClause, paginate, parseJson } from "./client";

export interface EventRow {
  id: string;
  email_id: string;
  project_id: string;
  recipient: string | null;
  type: string;
  cloudflare_event_id: string | null;
  data: string | null;
  created_at: string;
}

export function toEventRecord(e: EventRow): EventRecord {
  return {
    id: e.id,
    emailId: e.email_id,
    projectId: e.project_id,
    type: e.type,
    recipient: e.recipient,
    data: parseJson<unknown>(e.data, null),
    createdAt: e.created_at,
  };
}

export function insertEventStmt(db: D1Database, e: EventRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO email_events (id, email_id, project_id, recipient, type, cloudflare_event_id, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(e.id, e.email_id, e.project_id, e.recipient, e.type, e.cloudflare_event_id, e.data, e.created_at);
}

export async function eventExists(db: D1Database, cfEventId: string): Promise<boolean> {
  return (await one<{ x: number }>(db.prepare("SELECT 1 AS x FROM email_events WHERE cloudflare_event_id = ?").bind(cfEventId))) !== null;
}

export function listEventsForEmail(db: D1Database, emailId: string) {
  return all<EventRow>(db.prepare("SELECT * FROM email_events WHERE email_id = ? ORDER BY created_at ASC, id ASC").bind(emailId));
}

export function getEventById(db: D1Database, id: string) {
  return one<EventRow>(db.prepare("SELECT * FROM email_events WHERE id = ?").bind(id));
}

export async function listEvents(
  db: D1Database,
  q: { projectId?: string | null; limit: number; cursor?: string; type?: string; emailId?: string; since?: string },
) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.projectId) {
    where.push("project_id = ?");
    params.push(q.projectId);
  }
  if (q.type) {
    where.push("type = ?");
    params.push(q.type);
  }
  if (q.emailId) {
    where.push("email_id = ?");
    params.push(q.emailId);
  }
  if (q.since) {
    where.push("created_at >= ?");
    params.push(new Date(q.since).toISOString());
  }
  pageClause(q.cursor, where, params);
  const sql = `SELECT * FROM email_events ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY created_at DESC, id DESC LIMIT ?`;
  const rows = await all<EventRow>(db.prepare(sql).bind(...params, q.limit + 1));
  return paginate(rows, q.limit);
}

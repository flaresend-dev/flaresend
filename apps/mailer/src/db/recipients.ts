import { all, allInChunks, one } from "./client";

export type RecipientKind = "to" | "cc" | "bcc";

export interface RecipientRow {
  id: string;
  email_id: string;
  address: string;
  kind: RecipientKind;
  status: string;
  provider: string | null;
  smtp_status: string | null;
  smtp_response: string | null;
  delivery_ms: number | null;
  bounce_type: string | null;
  last_event_at: string | null;
}

export function insertRecipientStmt(db: D1Database, r: RecipientRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO email_recipients (id, email_id, address, kind, status, provider, smtp_status, smtp_response, delivery_ms, bounce_type, last_event_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(r.id, r.email_id, r.address, r.kind, r.status, r.provider, r.smtp_status, r.smtp_response, r.delivery_ms, r.bounce_type, r.last_event_at);
}

export function listRecipients(db: D1Database, emailId: string) {
  return all<RecipientRow>(
    db.prepare("SELECT * FROM email_recipients WHERE email_id = ? ORDER BY CASE kind WHEN 'to' THEN 0 WHEN 'cc' THEN 1 ELSE 2 END, rowid").bind(emailId),
  );
}

export function listRecipientsForEmails(db: D1Database, emailIds: string[]) {
  return allInChunks<RecipientRow>(db, (ph) => `SELECT * FROM email_recipients WHERE email_id IN (${ph})`, emailIds);
}

export function getRecipient(db: D1Database, emailId: string, address: string) {
  return one<RecipientRow>(db.prepare("SELECT * FROM email_recipients WHERE email_id = ? AND address = ?").bind(emailId, address));
}

export function setAllRecipientsStatusStmt(db: D1Database, emailId: string, status: string, at: string | null = null) {
  return db
    .prepare("UPDATE email_recipients SET status = ?, last_event_at = COALESCE(?, last_event_at) WHERE email_id = ?")
    .bind(status, at, emailId);
}

export function updateRecipientStmt(db: D1Database, r: RecipientRow): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE email_recipients SET status = ?, provider = ?, smtp_status = ?, smtp_response = ?, delivery_ms = ?, bounce_type = ?, last_event_at = ?
       WHERE id = ?`,
    )
    .bind(r.status, r.provider, r.smtp_status, r.smtp_response, r.delivery_ms, r.bounce_type, r.last_event_at, r.id);
}

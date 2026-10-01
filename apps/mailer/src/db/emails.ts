import type { EmailRecord, EmailStatus, ParsedListEmailsQuery } from "@flaresend/types";
import { all, bool, likeEscape, one, pageClause, paginate, parseJson } from "./client";
import type { RecipientRow } from "./recipients";
import type { EventRow } from "./events";

export interface EmailRow {
  purpose?: "transactional" | "subscription_confirmation" | "newsletter";
  newsletter_run_id?: string | null;
  newsletter_recipient_id?: string | null;
  newsletter_token_hash?: string | null;
  id: string;
  project_id: string;
  api_key_id: string | null;
  mode: "live" | "test";
  source: "http" | "rpc" | "batch" | "broadcast" | "scheduled";
  from_address: string;
  from_name: string | null;
  reply_to: string | null;
  to_addresses: string;
  cc_addresses: string;
  bcc_addresses: string;
  subject: string;
  text_preview: string | null;
  has_html: number;
  has_text: number;
  attachment_count: number;
  size_bytes: number;
  tags: string | null;
  template_name: string | null;
  template_version: number | null;
  idempotency_key: string | null;
  body_hash: string | null;
  status: EmailStatus;
  cloudflare_message_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  attempts: number;
  created_at: string;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  scheduled_at: string | null;
  enqueued_at: string | null;
  track_opens: number;
  track_clicks: number;
  open_token: string | null;
  opened_at: string | null;
  first_clicked_at: string | null;
}

export type NewEmailRow = Omit<EmailRow, "open_token" | "opened_at" | "first_clicked_at">;

export function toEmailRecord(e: EmailRow, recipients: RecipientRow[], events: EventRow[]): EmailRecord {
  return {
    id: e.id,
    projectId: e.project_id,
    mode: e.mode,
    source: e.source,
    from: e.from_address,
    fromName: e.from_name,
    replyTo: e.reply_to,
    to: parseJson<string[]>(e.to_addresses, []),
    cc: parseJson<string[]>(e.cc_addresses, []),
    bcc: parseJson<string[]>(e.bcc_addresses, []),
    subject: e.subject,
    textPreview: e.text_preview,
    tags: parseJson<Record<string, string> | null>(e.tags, null),
    template: e.template_name,
    templateVersion: e.template_version ?? null,
    status: e.status,
    cloudflareMessageId: e.cloudflare_message_id,
    lastError: e.last_error_code ? { code: e.last_error_code, message: e.last_error_message ?? "" } : null,
    attempts: e.attempts,
    sizeBytes: e.size_bytes,
    attachmentCount: e.attachment_count,
    trackOpens: bool(e.track_opens),
    trackClicks: bool(e.track_clicks),
    openedAt: e.opened_at ?? null,
    firstClickedAt: e.first_clicked_at ?? null,
    createdAt: e.created_at,
    queuedAt: e.queued_at,
    sentAt: e.sent_at,
    deliveredAt: e.delivered_at,
    failedAt: e.failed_at,
    scheduledAt: e.scheduled_at,
    recipients: recipients.map((r) => ({
      address: r.address,
      kind: r.kind,
      status: r.status,
      provider: r.provider,
      smtpStatus: r.smtp_status,
      smtpResponse: r.smtp_response,
      deliveryMs: r.delivery_ms,
      bounceType: r.bounce_type,
      lastEventAt: r.last_event_at,
    })),
    events: events.map((ev) => ({
      id: ev.id,
      type: ev.type,
      recipient: ev.recipient,
      data: parseJson<unknown>(ev.data, null),
      createdAt: ev.created_at,
    })),
  };
}

const EMAIL_COLUMNS = [
  "id", "project_id", "api_key_id", "mode", "source", "from_address", "from_name", "reply_to",
  "to_addresses", "cc_addresses", "bcc_addresses", "subject", "text_preview", "has_html", "has_text",
  "attachment_count", "size_bytes", "tags", "template_name", "template_version", "idempotency_key", "body_hash",
  "status", "cloudflare_message_id", "last_error_code", "last_error_message", "attempts",
  "created_at", "queued_at", "sent_at", "delivered_at", "failed_at", "scheduled_at", "enqueued_at",
  "track_opens", "track_clicks",
] as const;

export function insertEmailStmt(db: D1Database, e: NewEmailRow): D1PreparedStatement {
  const columns = [...EMAIL_COLUMNS, "purpose", "newsletter_token_hash", "newsletter_run_id", "newsletter_recipient_id"];
  const sql = `INSERT INTO emails (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  return db.prepare(sql).bind(...columns.map((c) => (e as unknown as Record<string, unknown>)[c] ?? (c === "purpose" ? "transactional" : null)));
}

export function getEmailById(db: D1Database, id: string, projectId?: string | null) {
  if (projectId) return one<EmailRow>(db.prepare("SELECT * FROM emails WHERE id = ? AND project_id = ?").bind(id, projectId));
  return one<EmailRow>(db.prepare("SELECT * FROM emails WHERE id = ?").bind(id));
}

export function getEmailByMessageId(db: D1Database, messageId: string) {
  return one<EmailRow>(db.prepare("SELECT * FROM emails WHERE cloudflare_message_id = ?").bind(messageId));
}

export function getEmailByIdempotencyKey(db: D1Database, projectId: string, key: string) {
  return one<EmailRow>(
    db.prepare("SELECT * FROM emails WHERE project_id = ? AND idempotency_key = ?").bind(projectId, key),
  );
}

export function getEmailByOpenToken(db: D1Database, token: string) {
  return one<EmailRow>(db.prepare("SELECT * FROM emails WHERE open_token = ?").bind(token));
}

/** Filters shared by the project list and the admin cross-project list. */
export function buildEmailFilters(
  q: ParsedListEmailsQuery & { projectId?: string | null },
): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.projectId) {
    where.push("e.project_id = ?");
    params.push(q.projectId);
  }
  if (q.status) {
    where.push("e.status = ?");
    params.push(q.status);
  }
  if (q.from) {
    where.push("e.from_address = ?");
    params.push(q.from.trim().toLowerCase());
  }
  if (q.to) {
    const to = q.to.trim().toLowerCase();
    // `to` matches any recipient kind (to, cc, bcc). Exact match for full addresses, substring otherwise.
    if (to.includes("@")) {
      where.push("EXISTS (SELECT 1 FROM email_recipients r WHERE r.email_id = e.id AND r.address = ?)");
      params.push(to);
    } else {
      where.push("EXISTS (SELECT 1 FROM email_recipients r WHERE r.email_id = e.id AND r.address LIKE ? ESCAPE '\\')");
      params.push(`%${likeEscape(to)}%`);
    }
  }
  if (q.q) {
    where.push("e.subject LIKE ? ESCAPE '\\'");
    params.push(`%${likeEscape(q.q)}%`);
  }
  if (q.tag) {
    const i = q.tag.indexOf(":");
    const key = q.tag.slice(0, i);
    const value = q.tag.slice(i + 1);
    where.push("json_extract(e.tags, ?) = ?");
    params.push(`$."${key.replace(/"/g, '""')}"`, value);
  }
  if (q.since) {
    where.push("e.created_at >= ?");
    params.push(new Date(q.since).toISOString());
  }
  if (q.until) {
    where.push("e.created_at < ?");
    params.push(new Date(q.until).toISOString());
  }
  return { where, params };
}

export async function listEmails(db: D1Database, q: ParsedListEmailsQuery & { projectId?: string | null }) {
  const { where, params } = buildEmailFilters(q);
  pageClause(q.cursor, where, params, "e");
  const sql = `SELECT e.* FROM emails e ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY e.created_at DESC, e.id DESC LIMIT ?`;
  const rows = await all<EmailRow>(db.prepare(sql).bind(...params, q.limit + 1));
  return paginate(rows, q.limit);
}

import type { SuppressionRecord } from "@flaresend/types";
import { all, allInChunks, likeEscape, one } from "./client";

export interface SuppressionRow {
  address: string;
  reason: string;
  source_email_id: string | null;
  created_at: string;
}

export function toSuppressionRecord(s: SuppressionRow): SuppressionRecord {
  return { address: s.address, reason: s.reason, sourceEmailId: s.source_email_id, createdAt: s.created_at };
}

export function findSuppressed(db: D1Database, addresses: string[]) {
  if (addresses.length === 0) return Promise.resolve([] as SuppressionRow[]);
  return allInChunks<SuppressionRow>(db, (ph) => `SELECT * FROM suppressions WHERE address IN (${ph})`, addresses);
}

/** Insert or keep the existing row. A complaint upgrades an existing hard_bounce/manual reason. */
export function upsertSuppressionStmt(db: D1Database, s: SuppressionRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO suppressions (address, reason, source_email_id, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET reason = CASE WHEN excluded.reason = 'complaint' THEN 'complaint' ELSE suppressions.reason END`,
    )
    .bind(s.address, s.reason, s.source_email_id, s.created_at);
}

export function getSuppression(db: D1Database, address: string) {
  return one<SuppressionRow>(db.prepare("SELECT * FROM suppressions WHERE address = ?").bind(address));
}

export function deleteSuppression(db: D1Database, address: string) {
  return db.prepare("DELETE FROM suppressions WHERE address = ?").bind(address).run();
}

export async function listSuppressions(db: D1Database, q: { limit: number; cursor?: string; q?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.q) {
    where.push("address LIKE ? ESCAPE '\\'");
    params.push(`%${likeEscape(q.q.toLowerCase())}%`);
  }
  if (q.cursor) {
    where.push("address > ?");
    params.push(q.cursor);
  }
  const rows = await all<SuppressionRow>(
    db.prepare(`SELECT * FROM suppressions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY address ASC LIMIT ?`).bind(...params, q.limit + 1),
  );
  const page = rows.slice(0, q.limit);
  return { rows: page, nextCursor: rows.length > q.limit ? page[page.length - 1]!.address : null };
}

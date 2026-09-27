// Tiny typed helpers over D1. No ORM.

export async function one<T>(stmt: D1PreparedStatement): Promise<T | null> {
  return (await stmt.first<T>()) ?? null;
}

export async function all<T>(stmt: D1PreparedStatement): Promise<T[]> {
  const r = await stmt.all<T>();
  return r.results ?? [];
}

export async function run(stmt: D1PreparedStatement): Promise<D1Result> {
  return stmt.run();
}

export async function batch(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  if (stmts.length === 0) return [];
  return db.batch(stmts);
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (s == null || s === "") return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function bool(v: number | null | undefined): boolean {
  return v === 1;
}

/** Escape % and _ for a LIKE pattern used with ESCAPE '\'. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

/** Cursor = base64url("<created_at>|<id>"). */
export function encodeCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}|${id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string | undefined | null): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const s = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const i = s.lastIndexOf("|");
    if (i <= 0) return null;
    return { createdAt: s.slice(0, i), id: s.slice(i + 1) };
  } catch {
    return null;
  }
}

/**
 * Builds a keyset-paginated query over (created_at DESC, id DESC).
 * `where` and `params` are the filter clauses; the cursor clause is added here.
 */
export function pageClause(
  cursor: string | undefined | null,
  where: string[],
  params: unknown[],
  alias = "",
): void {
  const c = decodeCursor(cursor);
  if (!c) return;
  const p = alias ? `${alias}.` : "";
  where.push(`(${p}created_at < ? OR (${p}created_at = ? AND ${p}id < ?))`);
  params.push(c.createdAt, c.createdAt, c.id);
}

export function paginate<T extends { created_at: string; id: string }>(rows: T[], limit: number): { rows: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const page = rows.slice(0, limit);
  const last = page[page.length - 1]!;
  return { rows: page, nextCursor: encodeCursor(last.created_at, last.id) };
}

/** Run a query with a large IN (...) list in chunks (D1 caps bound parameters at 100). */
export async function allInChunks<T>(
  db: D1Database,
  sql: (placeholders: string) => string,
  values: string[],
  prefixParams: unknown[] = [],
  chunkSize = 90,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const ph = chunk.map(() => "?").join(",");
    out.push(...(await all<T>(db.prepare(sql(ph)).bind(...prefixParams, ...chunk))));
  }
  return out;
}

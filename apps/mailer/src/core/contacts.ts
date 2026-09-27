// Contacts and audiences. Built for small, opted-in lists only.
import {
  AudienceContactsInput, ContactInput, CreateAudienceInput, ImportContactsInput, UpdateContactInput,
  type AudienceRecord, type ContactRecord, type ListResponse,
} from "@flaresend/types";
import type { z } from "zod";
import { all, allInChunks, likeEscape, one, pageClause, paginate } from "../db/client";
import { toAudienceRecord, toContactRecord, type AudienceRow, type ContactRow } from "../db/contacts";
import { ApiError } from "../http/errors";
import { hmacSha256, timingSafeEqual, toBase64Url } from "./keys";
import { newId, nowIso } from "./ids";

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw ApiError.fromZod(r.error);
  return r.data;
}

function limitOf(v: unknown, def = 25, max = 100): number {
  return Math.min(Math.max(Number(v ?? def) || def, 1), max);
}

// ---------- contacts ----------

async function requireContact(env: Env, projectId: string, id: string): Promise<ContactRow> {
  const c = await one<ContactRow>(env.DB.prepare("SELECT * FROM contacts WHERE id = ? AND project_id = ?").bind(id, projectId));
  if (!c) throw ApiError.notFound("contact_not_found", `contact ${id} not found`, "id");
  return c;
}

export async function listContacts(env: Env, projectId: string, q: { limit?: unknown; cursor?: string; q?: string }): Promise<ListResponse<ContactRecord>> {
  const limit = limitOf(q.limit);
  const where = ["project_id = ?"];
  const params: unknown[] = [projectId];
  if (q.q) {
    where.push("(email LIKE ? ESCAPE '\\' OR first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\')");
    const like = `%${likeEscape(q.q)}%`;
    params.push(like, like, like);
  }
  pageClause(q.cursor, where, params);
  const rows = await all<ContactRow>(
    env.DB.prepare(`SELECT * FROM contacts WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...params, limit + 1),
  );
  const page = paginate(rows, limit);
  return { data: page.rows.map(toContactRecord), nextCursor: page.nextCursor };
}

function upsertStmt(env: Env, projectId: string, c: z.output<typeof ContactInput>, now: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO contacts (id, project_id, email, first_name, last_name, unsubscribed, data, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(project_id, email) DO UPDATE SET
       first_name = COALESCE(?4, first_name),
       last_name = COALESCE(?5, last_name),
       unsubscribed = CASE WHEN ?9 THEN ?6 ELSE unsubscribed END,
       data = COALESCE(?7, data),
       updated_at = ?8`,
  ).bind(
    newId("ct"), projectId, c.email, c.firstName ?? null, c.lastName ?? null, c.unsubscribed ? 1 : 0,
    c.data ? JSON.stringify(c.data) : null, now, c.unsubscribed === undefined ? 0 : 1,
  );
}

export async function upsertContact(env: Env, projectId: string, raw: unknown): Promise<ContactRecord> {
  const input = parse(ContactInput, raw);
  await upsertStmt(env, projectId, input, nowIso()).run();
  const row = await one<ContactRow>(env.DB.prepare("SELECT * FROM contacts WHERE project_id = ? AND email = ?").bind(projectId, input.email));
  return toContactRecord(row!);
}

export async function getContact(env: Env, projectId: string, id: string): Promise<ContactRecord> {
  return toContactRecord(await requireContact(env, projectId, id));
}

export async function patchContact(env: Env, projectId: string, id: string, raw: unknown): Promise<ContactRecord> {
  const c = await requireContact(env, projectId, id);
  const input = parse(UpdateContactInput, raw);
  await env.DB.prepare("UPDATE contacts SET first_name = ?, last_name = ?, unsubscribed = ?, data = ?, updated_at = ? WHERE id = ?").bind(
    input.firstName === undefined ? c.first_name : input.firstName,
    input.lastName === undefined ? c.last_name : input.lastName,
    input.unsubscribed === undefined ? c.unsubscribed : input.unsubscribed ? 1 : 0,
    input.data === undefined ? c.data : input.data ? JSON.stringify(input.data) : null,
    nowIso(),
    id,
  ).run();
  return getContact(env, projectId, id);
}

export async function removeContact(env: Env, projectId: string, id: string): Promise<{ id: string; deleted: true }> {
  await requireContact(env, projectId, id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM audience_contacts WHERE contact_id = ?").bind(id),
    env.DB.prepare("DELETE FROM contacts WHERE id = ?").bind(id),
  ]);
  return { id, deleted: true };
}

export async function importContacts(env: Env, projectId: string, raw: unknown): Promise<{ created: number; updated: number }> {
  const items = parse(ImportContactsInput, raw);
  const byEmail = new Map(items.map((c) => [c.email, c])); // last one wins on duplicates
  const emails = [...byEmail.keys()];
  const existing = await allInChunks<{ email: string }>(
    env.DB,
    (ph) => `SELECT email FROM contacts WHERE project_id = ? AND email IN (${ph})`,
    emails,
    [projectId],
  );
  const now = nowIso();
  const stmts = [...byEmail.values()].map((c) => upsertStmt(env, projectId, c, now));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return { created: emails.length - existing.length, updated: existing.length };
}

// ---------- audiences ----------

const AUDIENCE_SELECT = `SELECT a.*, (SELECT COUNT(*) FROM audience_contacts ac WHERE ac.audience_id = a.id) AS contact_count FROM audiences a`;

export async function requireAudience(env: Env, projectId: string, id: string): Promise<AudienceRow> {
  const a = await one<AudienceRow>(env.DB.prepare(`${AUDIENCE_SELECT} WHERE a.id = ? AND a.project_id = ?`).bind(id, projectId));
  if (!a) throw ApiError.notFound("audience_not_found", `audience ${id} not found`, "id");
  return a;
}

export async function listAudiences(env: Env, projectId: string): Promise<AudienceRecord[]> {
  return (await all<AudienceRow>(env.DB.prepare(`${AUDIENCE_SELECT} WHERE a.project_id = ? ORDER BY a.name`).bind(projectId))).map(toAudienceRecord);
}

export async function createAudience(env: Env, projectId: string, raw: unknown): Promise<AudienceRecord> {
  const { name } = parse(CreateAudienceInput, raw);
  const row: AudienceRow = { id: newId("aud"), project_id: projectId, name, created_at: nowIso() };
  try {
    await env.DB.prepare("INSERT INTO audiences (id, project_id, name, created_at) VALUES (?, ?, ?, ?)").bind(row.id, projectId, name, row.created_at).run();
  } catch (err) {
    if (/UNIQUE/i.test(String(err))) throw ApiError.conflict("audience_exists", `audience "${name}" already exists`, "name");
    throw err;
  }
  return toAudienceRecord(row);
}

export async function getAudience(env: Env, projectId: string, id: string): Promise<AudienceRecord> {
  return toAudienceRecord(await requireAudience(env, projectId, id));
}

export async function renameAudience(env: Env, projectId: string, id: string, raw: unknown): Promise<AudienceRecord> {
  await requireAudience(env, projectId, id);
  const { name } = parse(CreateAudienceInput, raw);
  await env.DB.prepare("UPDATE audiences SET name = ? WHERE id = ?").bind(name, id).run();
  return getAudience(env, projectId, id);
}

export async function removeAudience(env: Env, projectId: string, id: string): Promise<{ id: string; deleted: true }> {
  await requireAudience(env, projectId, id);
  const active = await one(env.DB.prepare("SELECT 1 AS x FROM broadcasts WHERE audience_id = ? AND status IN ('scheduled','sending')").bind(id));
  if (active) throw ApiError.conflict("audience_in_use", "a broadcast to this audience is scheduled or sending", "id");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM audience_contacts WHERE audience_id = ?").bind(id),
    env.DB.prepare("DELETE FROM audiences WHERE id = ?").bind(id),
  ]);
  return { id, deleted: true };
}

export async function listAudienceContacts(env: Env, projectId: string, id: string, q: { limit?: unknown; cursor?: string }): Promise<ListResponse<ContactRecord>> {
  await requireAudience(env, projectId, id);
  const limit = limitOf(q.limit);
  const where = ["ac.audience_id = ?"];
  const params: unknown[] = [id];
  pageClause(q.cursor, where, params, "c");
  const rows = await all<ContactRow>(
    env.DB.prepare(
      `SELECT c.* FROM audience_contacts ac JOIN contacts c ON c.id = ac.contact_id WHERE ${where.join(" AND ")}
       ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
    ).bind(...params, limit + 1),
  );
  const page = paginate(rows, limit);
  return { data: page.rows.map(toContactRecord), nextCursor: page.nextCursor };
}

export async function addAudienceContacts(env: Env, projectId: string, id: string, raw: unknown): Promise<{ added: number }> {
  await requireAudience(env, projectId, id);
  const { contactIds } = parse(AudienceContactsInput, raw);
  const unique = [...new Set(contactIds)];
  const owned = await allInChunks<{ id: string }>(
    env.DB,
    (ph) => `SELECT id FROM contacts WHERE project_id = ? AND id IN (${ph})`,
    unique,
    [projectId],
  );
  if (owned.length !== unique.length) {
    const ok = new Set(owned.map((o) => o.id));
    const missing = unique.find((c) => !ok.has(c))!;
    throw ApiError.notFound("contact_not_found", `contact ${missing} not found`, "contactIds");
  }
  const stmts = unique.map((cid) => env.DB.prepare("INSERT OR IGNORE INTO audience_contacts (audience_id, contact_id) VALUES (?, ?)").bind(id, cid));
  let added = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    for (const r of await env.DB.batch(stmts.slice(i, i + 100))) added += r.meta.changes;
  }
  return { added };
}

export async function removeAudienceContacts(env: Env, projectId: string, id: string, raw: unknown): Promise<{ removed: number }> {
  await requireAudience(env, projectId, id);
  const { contactIds } = parse(AudienceContactsInput, raw);
  const stmts = [...new Set(contactIds)].map((cid) => env.DB.prepare("DELETE FROM audience_contacts WHERE audience_id = ? AND contact_id = ?").bind(id, cid));
  let removed = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    for (const r of await env.DB.batch(stmts.slice(i, i + 100))) removed += r.meta.changes;
  }
  return { removed };
}

// ---------- unsubscribe tokens ----------

/** Token = base64url(HMAC-SHA256(TRACKING_SECRET, contactId)) + "." + contactId */
export async function unsubscribeToken(secret: string, contactId: string): Promise<string> {
  return `${toBase64Url(await hmacSha256(secret, contactId))}.${contactId}`;
}

export async function verifyUnsubscribeToken(secret: string, token: string): Promise<string | null> {
  const i = token.indexOf(".");
  if (i <= 0) return null;
  const contactId = token.slice(i + 1);
  const expected = await unsubscribeToken(secret, contactId);
  return (await timingSafeEqual(expected, token)) ? contactId : null;
}

export async function unsubscribeContact(env: Env, contactId: string): Promise<ContactRow | null> {
  await env.DB.prepare("UPDATE contacts SET unsubscribed = 1, updated_at = ? WHERE id = ?").bind(nowIso(), contactId).run();
  return one<ContactRow>(env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(contactId));
}

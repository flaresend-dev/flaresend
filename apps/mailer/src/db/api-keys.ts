import type { ApiKeyRecord } from "@flaresend/types";
import { all, one } from "./client";

export interface ApiKeyRow {
  id: string;
  project_id: string;
  name: string;
  mode: "live" | "test";
  key_prefix: string;
  key_hash: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
}

export function toApiKeyRecord(k: ApiKeyRow): ApiKeyRecord {
  return {
    id: k.id,
    projectId: k.project_id,
    name: k.name,
    mode: k.mode,
    prefix: k.key_prefix,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
    revokedAt: k.revoked_at,
    expiresAt: k.expires_at,
  };
}

export function insertApiKey(db: D1Database, k: ApiKeyRow) {
  return db
    .prepare(
      `INSERT INTO api_keys (id, project_id, name, mode, key_prefix, key_hash, last_used_at, created_at, revoked_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(k.id, k.project_id, k.name, k.mode, k.key_prefix, k.key_hash, k.last_used_at, k.created_at, k.revoked_at, k.expires_at)
    .run();
}

export function getApiKeyByHash(db: D1Database, hash: string) {
  return one<ApiKeyRow>(db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").bind(hash));
}

export function getApiKeyById(db: D1Database, id: string) {
  return one<ApiKeyRow>(db.prepare("SELECT * FROM api_keys WHERE id = ?").bind(id));
}

export function listApiKeys(db: D1Database, projectId?: string) {
  if (projectId) {
    return all<ApiKeyRow>(db.prepare("SELECT * FROM api_keys WHERE project_id = ? ORDER BY created_at DESC").bind(projectId));
  }
  return all<ApiKeyRow>(db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC"));
}

export function touchApiKey(db: D1Database, id: string, at: string) {
  return db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(at, id).run();
}

export function revokeApiKey(db: D1Database, id: string, at: string) {
  return db.prepare("UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").bind(at, id).run();
}

export function renameApiKey(db: D1Database, id: string, name: string) {
  return db.prepare("UPDATE api_keys SET name = ? WHERE id = ?").bind(name, id).run();
}

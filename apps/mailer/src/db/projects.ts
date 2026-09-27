import type { ProjectRecord } from "@flaresend/types";
import { all, bool, one, parseJson } from "./client";

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  default_from: string | null;
  allowed_domains: string;
  allowed_senders: string | null;
  domain_senders: string | null;
  rpc_enabled: number;
  daily_limit: number;
  track_opens: number;
  track_clicks: number;
  broadcasts_enabled: number;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

export function allowedDomains(p: ProjectRow): string[] {
  return parseJson<string[]>(p.allowed_domains, []).map((d) => d.toLowerCase());
}

export function allowedSenders(p: ProjectRow): string[] | null {
  const s = parseJson<string[] | null>(p.allowed_senders, null);
  return s ? s.map((a) => a.toLowerCase()) : null;
}

export function domainSenders(p: ProjectRow): Record<string, string> {
  return parseJson<Record<string, string>>(p.domain_senders, {});
}

export function toProjectRecord(p: ProjectRow): ProjectRecord {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    defaultFrom: p.default_from,
    allowedDomains: allowedDomains(p),
    allowedSenders: allowedSenders(p),
    domainSenders: domainSenders(p),
    rpcEnabled: bool(p.rpc_enabled),
    dailyLimit: p.daily_limit,
    trackOpens: bool(p.track_opens),
    trackClicks: bool(p.track_clicks),
    broadcastsEnabled: bool(p.broadcasts_enabled),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    disabledAt: p.disabled_at,
  };
}

export function getProjectBySlug(db: D1Database, slug: string) {
  return one<ProjectRow>(db.prepare("SELECT * FROM projects WHERE slug = ?").bind(slug));
}

export function getProjectById(db: D1Database, id: string) {
  return one<ProjectRow>(db.prepare("SELECT * FROM projects WHERE id = ?").bind(id));
}

export function listProjects(db: D1Database) {
  return all<ProjectRow>(db.prepare("SELECT * FROM projects ORDER BY created_at ASC"));
}

export function insertProject(db: D1Database, p: ProjectRow) {
  return db
    .prepare(
      `INSERT INTO projects (id, slug, name, default_from, allowed_domains, allowed_senders, domain_senders, rpc_enabled, daily_limit,
         track_opens, track_clicks, broadcasts_enabled, created_at, updated_at, disabled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      p.id, p.slug, p.name, p.default_from, p.allowed_domains, p.allowed_senders, p.domain_senders, p.rpc_enabled, p.daily_limit,
      p.track_opens, p.track_clicks, p.broadcasts_enabled, p.created_at, p.updated_at, p.disabled_at,
    )
    .run();
}

const UPDATABLE = [
  "name", "default_from", "allowed_domains", "allowed_senders", "domain_senders", "rpc_enabled", "daily_limit",
  "track_opens", "track_clicks", "broadcasts_enabled", "disabled_at", "updated_at",
] as const;

export function updateProject(db: D1Database, id: string, patch: Partial<Pick<ProjectRow, (typeof UPDATABLE)[number]>>) {
  const keys = UPDATABLE.filter((k) => k in patch);
  if (keys.length === 0) return Promise.resolve();
  const sql = `UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  return db.prepare(sql).bind(...keys.map((k) => patch[k] ?? null), id).run();
}

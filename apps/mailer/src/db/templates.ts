import type { TemplateRecord, TemplateVariable, TemplateVersionRecord } from "@flaresend/types";
import { all, one, parseJson } from "./client";

export interface TemplateRow {
  id: string;
  project_id: string;
  name: string;
  subject: string;
  html: string;
  text: string | null;
  variables: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersionRow {
  template_id: string;
  version: number;
  subject: string;
  html: string;
  text: string | null;
  variables: string | null;
  created_at: string;
}

export function templateVariables(t: { variables: string | null }): TemplateVariable[] {
  return parseJson<TemplateVariable[]>(t.variables, []);
}

export function toTemplateRecord(t: TemplateRow): TemplateRecord {
  return {
    id: t.id,
    source: "db",
    projectId: t.project_id,
    name: t.name,
    subject: t.subject,
    html: t.html,
    text: t.text,
    variables: templateVariables(t),
    version: t.version,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

export function toTemplateVersionRecord(v: TemplateVersionRow): TemplateVersionRecord {
  return {
    templateId: v.template_id,
    version: v.version,
    subject: v.subject,
    html: v.html,
    text: v.text,
    variables: templateVariables(v),
    createdAt: v.created_at,
  };
}

export function getTemplateByName(db: D1Database, projectId: string, name: string) {
  return one<TemplateRow>(db.prepare("SELECT * FROM templates WHERE project_id = ? AND name = ?").bind(projectId, name));
}

export function listTemplatesDb(db: D1Database, projectId: string) {
  return all<TemplateRow>(db.prepare("SELECT * FROM templates WHERE project_id = ? ORDER BY name ASC").bind(projectId));
}

export function insertTemplateStmts(db: D1Database, t: TemplateRow): D1PreparedStatement[] {
  return [
    db
      .prepare(
        "INSERT INTO templates (id, project_id, name, subject, html, text, variables, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(t.id, t.project_id, t.name, t.subject, t.html, t.text, t.variables, t.version, t.created_at, t.updated_at),
    insertVersionStmt(db, { template_id: t.id, version: t.version, subject: t.subject, html: t.html, text: t.text, variables: t.variables, created_at: t.updated_at }),
  ];
}

export function insertVersionStmt(db: D1Database, v: TemplateVersionRow): D1PreparedStatement {
  return db
    .prepare("INSERT INTO template_versions (template_id, version, subject, html, text, variables, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(v.template_id, v.version, v.subject, v.html, v.text, v.variables, v.created_at);
}

/** Bump to a new version: update the head row (guarded by the expected current version) and append history. */
export function updateTemplateStmts(db: D1Database, t: TemplateRow, expectedVersion: number): D1PreparedStatement[] {
  return [
    db
      .prepare("UPDATE templates SET subject = ?, html = ?, text = ?, variables = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?")
      .bind(t.subject, t.html, t.text, t.variables, t.version, t.updated_at, t.id, expectedVersion),
    insertVersionStmt(db, { template_id: t.id, version: t.version, subject: t.subject, html: t.html, text: t.text, variables: t.variables, created_at: t.updated_at }),
  ];
}

export function listTemplateVersions(db: D1Database, templateId: string) {
  return all<TemplateVersionRow>(db.prepare("SELECT * FROM template_versions WHERE template_id = ? ORDER BY version DESC").bind(templateId));
}

export function getTemplateVersion(db: D1Database, templateId: string, version: number) {
  return one<TemplateVersionRow>(db.prepare("SELECT * FROM template_versions WHERE template_id = ? AND version = ?").bind(templateId, version));
}

export function deleteTemplate(db: D1Database, id: string) {
  return db.batch([
    db.prepare("DELETE FROM template_versions WHERE template_id = ?").bind(id),
    db.prepare("DELETE FROM templates WHERE id = ?").bind(id),
  ]);
}

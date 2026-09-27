// Template CRUD. D1 templates shadow Git templates of the same name.
import { listTemplates as listGitTemplates } from "@flaresend/templates";
import {
  CreateTemplateInput, RenderTemplateInput, RestoreTemplateInput, UpdateTemplateInput,
  type RenderedTemplate, type TemplateRecord, type TemplateVersionRecord,
} from "@flaresend/types";
import type { z } from "zod";
import {
  deleteTemplate, getTemplateByName, getTemplateVersion, insertTemplateStmts, listTemplateVersions, listTemplatesDb,
  toTemplateRecord, toTemplateVersionRecord, updateTemplateStmts, type TemplateRow,
} from "../db/templates";
import { ApiError } from "../http/errors";
import { newId, nowIso } from "./ids";
import { parse as parseMustache, TemplateSyntaxError } from "./mustache";
import { renderForProject } from "./render";

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw ApiError.fromZod(r.error);
  return r.data;
}

function checkSyntax(fields: Record<string, string | null | undefined>): void {
  for (const [field, src] of Object.entries(fields)) {
    if (!src) continue;
    try {
      parseMustache(src);
    } catch (err) {
      if (err instanceof TemplateSyntaxError) throw ApiError.validation("invalid_template", `${field}: ${err.message}`, field);
      throw err;
    }
  }
}

function gitRecord(t: ReturnType<typeof listGitTemplates>[number]): TemplateRecord {
  return {
    id: null,
    source: "git",
    projectId: null,
    name: t.name,
    subject: "",
    html: null,
    text: null,
    variables: t.fields.map((name) => ({
      name,
      required: false,
      example: (t.example as Record<string, unknown> | undefined)?.[name],
    })),
    version: null,
    createdAt: null,
    updatedAt: null,
  };
}

async function requireDbTemplate(env: Env, projectId: string, name: string): Promise<TemplateRow> {
  const t = await getTemplateByName(env.DB, projectId, name);
  if (!t) throw ApiError.notFound("template_not_found", `template "${name}" not found`, "name");
  return t;
}

export async function listTemplateRecords(env: Env, projectId: string): Promise<TemplateRecord[]> {
  const db = (await listTemplatesDb(env.DB, projectId)).map(toTemplateRecord);
  const shadowed = new Set(db.map((t) => t.name));
  const git = listGitTemplates().filter((t) => !shadowed.has(t.name)).map(gitRecord);
  return [...db, ...git];
}

export async function getTemplateRecord(env: Env, projectId: string, name: string): Promise<TemplateRecord> {
  const row = await getTemplateByName(env.DB, projectId, name);
  if (row) return toTemplateRecord(row);
  const git = listGitTemplates().find((t) => t.name === name);
  if (git) {
    const rec = gitRecord(git);
    const r = await renderForProject(env.DB, projectId, name, git.example as Record<string, unknown>);
    return { ...rec, subject: r.subject, html: r.html, text: r.text };
  }
  throw ApiError.notFound("template_not_found", `template "${name}" not found`, "name");
}

export async function createTemplate(env: Env, projectId: string, raw: unknown): Promise<TemplateRecord> {
  const input = parse(CreateTemplateInput, raw);
  checkSyntax({ subject: input.subject, html: input.html, text: input.text });
  if (await getTemplateByName(env.DB, projectId, input.name)) {
    throw ApiError.conflict("template_exists", `template "${input.name}" already exists`, "name");
  }
  const now = nowIso();
  const row: TemplateRow = {
    id: newId("tmpl"), project_id: projectId, name: input.name, subject: input.subject, html: input.html,
    text: input.text ?? null, variables: JSON.stringify(input.variables ?? []), version: 1, created_at: now, updated_at: now,
  };
  await env.DB.batch(insertTemplateStmts(env.DB, row));
  return toTemplateRecord(row);
}

async function writeNewVersion(env: Env, current: TemplateRow, next: Pick<TemplateRow, "subject" | "html" | "text" | "variables">): Promise<TemplateRecord> {
  const row: TemplateRow = { ...current, ...next, version: current.version + 1, updated_at: nowIso() };
  const results = await env.DB.batch(updateTemplateStmts(env.DB, row, current.version));
  if (results[0]!.meta.changes !== 1) throw ApiError.conflict("template_conflict", "the template was changed by someone else; reload and retry", "name");
  return toTemplateRecord(row);
}

export async function patchTemplate(env: Env, projectId: string, name: string, raw: unknown): Promise<TemplateRecord> {
  const current = await requireDbTemplate(env, projectId, name);
  const input = parse(UpdateTemplateInput, raw);
  checkSyntax({ subject: input.subject, html: input.html, text: input.text });
  return writeNewVersion(env, current, {
    subject: input.subject ?? current.subject,
    html: input.html ?? current.html,
    text: input.text === undefined ? current.text : input.text,
    variables: input.variables === undefined ? current.variables : JSON.stringify(input.variables),
  });
}

export async function removeTemplate(env: Env, projectId: string, name: string): Promise<{ name: string; deleted: true }> {
  const t = await requireDbTemplate(env, projectId, name);
  await deleteTemplate(env.DB, t.id);
  return { name, deleted: true };
}

export async function listTemplateVersionRecords(env: Env, projectId: string, name: string): Promise<TemplateVersionRecord[]> {
  const t = await requireDbTemplate(env, projectId, name);
  return (await listTemplateVersions(env.DB, t.id)).map(toTemplateVersionRecord);
}

/** Restoring creates a NEW version whose content equals the old one (history stays append-only). */
export async function restoreTemplate(env: Env, projectId: string, name: string, raw: unknown): Promise<TemplateRecord> {
  const t = await requireDbTemplate(env, projectId, name);
  const { version } = parse(RestoreTemplateInput, raw);
  const v = await getTemplateVersion(env.DB, t.id, version);
  if (!v) throw ApiError.notFound("template_version_not_found", `version ${version} not found`, "version");
  return writeNewVersion(env, t, { subject: v.subject, html: v.html, text: v.text, variables: v.variables });
}

export async function renderTemplatePreview(env: Env, projectId: string, name: string, raw: unknown): Promise<RenderedTemplate> {
  const { data } = parse(RenderTemplateInput, raw ?? {});
  const r = await renderForProject(env.DB, projectId, name, data);
  return { subject: r.subject, html: r.html, text: r.text };
}

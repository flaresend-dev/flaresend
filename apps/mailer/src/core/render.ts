// Template rendering for sends and previews.
// Resolution order: a D1 template with that name for the project, else the Git registry, else 404.
import { isTemplateName, renderTemplate } from "@flaresend/templates";
import type { RenderedTemplate, TemplateVariable } from "@flaresend/types";
import { getTemplateByName, templateVariables, type TemplateRow } from "../db/templates";
import { ApiError } from "../http/errors";
import { getPath, renderMustache, TemplateSyntaxError } from "./mustache";
import { stripHtml } from "./validate";

export interface RenderResult extends RenderedTemplate {
  templateName: string;
  templateVersion: number | null;
  source: "db" | "git";
}

interface ZodLikeError {
  name: string;
  issues: Array<{ path: Array<string | number>; message: string }>;
}

function isZodError(e: unknown): e is ZodLikeError {
  return !!e && typeof e === "object" && (e as { name?: string }).name === "ZodError" && Array.isArray((e as ZodLikeError).issues);
}

export function checkRequiredVariables(vars: TemplateVariable[], data: Record<string, unknown>): void {
  for (const v of vars) {
    if (!v.required) continue;
    const value = getPath(data, v.name);
    if (value === undefined || value === null || value === "") {
      throw ApiError.validation("invalid_template_data", `data.${v.name} is required by this template`, `data.${v.name}`);
    }
  }
}

/** Plain text fallback for D1 templates without a text body. Keeps paragraph and link structure readable. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => `${stripHtml(label)} (${href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, "\n\n");
  return withBreaks
    .split(/\n/)
    .map((l) => stripHtml(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderDbTemplate(t: Pick<TemplateRow, "subject" | "html" | "text" | "variables">, data: Record<string, unknown>): RenderedTemplate {
  checkRequiredVariables(templateVariables(t), data);
  try {
    const html = renderMustache(t.html, data, { escape: true });
    return {
      subject: renderMustache(t.subject, data, { escape: false }).replace(/[\r\n]+/g, " ").trim(),
      html,
      text: t.text ? renderMustache(t.text, data, { escape: false }) : htmlToText(html),
    };
  } catch (err) {
    if (err instanceof TemplateSyntaxError) throw ApiError.validation("invalid_template", `template syntax error: ${err.message}`);
    throw err;
  }
}

export async function renderGitTemplate(name: string, data: Record<string, unknown>): Promise<RenderedTemplate> {
  if (!isTemplateName(name)) throw ApiError.notFound("template_not_found", `template "${name}" not found`, "template");
  try {
    return await renderTemplate(name, data);
  } catch (err) {
    if (isZodError(err)) {
      const issue = err.issues[0]!;
      const path = ["data", ...issue.path].join(".");
      throw ApiError.validation("invalid_template_data", `${path}: ${issue.message}`, path);
    }
    throw err;
  }
}

export async function renderForProject(db: D1Database, projectId: string, name: string, data: Record<string, unknown> = {}): Promise<RenderResult> {
  const row = await getTemplateByName(db, projectId, name);
  if (row) return { ...renderDbTemplate(row, data), templateName: name, templateVersion: row.version, source: "db" };
  const r = await renderGitTemplate(name, data);
  return { ...r, templateName: name, templateVersion: null, source: "git" };
}

import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { ProjectRecord } from "@flaresend/types";
import { mailerCall, type Result } from "./mailer";
import { ALL, link, type ProjectSection } from "./nav";

/**
 * The project for a `[slug]` page. The layout already 404s unknown slugs; pages call this for the record itself.
 * `cache` dedupes the call within one request.
 */
export const getProjectOr404 = cache(async (slug: string): Promise<ProjectRecord> => {
  const r = await mailerCall((m) => m.getProject(slug));
  if (!r.ok) notFound();
  return r.data;
});

export const listProjects = cache(() => mailerCall((m) => m.listProjects()));

/**
 * Route params of a project page. `view` is set when the page is rendered inside the "All projects" view
 * (`/all/...`), where `slug` is either one project or ALL for list pages that show every project.
 */
export type SlugParams = { params: Promise<{ slug: string; view?: string }> };
export type SearchParamsProp = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `link()` bound to a page's view and project. */
export function linker(slug: string, view?: string): (section: ProjectSection, ...rest: string[]) => string {
  return (section, ...rest) => link(view ?? slug, slug, section, ...rest);
}

/** The projects a list page shows: every project when `slug` is ALL, else just that one (404 when unknown). */
export async function projectsFor(slug: string): Promise<Result<ProjectRecord[]>> {
  if (slug === ALL) return listProjects();
  return { ok: true, data: [await getProjectOr404(slug)] };
}

/**
 * Runs one per-project list call for each project and joins the rows, each tagged with its project. Fails with
 * the first error, so a page never shows a list that is silently missing a project.
 */
export async function listAcross<T>(projects: ProjectRecord[], fn: (slug: string) => Promise<Result<T[]>>): Promise<Result<Array<T & { project: ProjectRecord }>>> {
  const results = await Promise.all(projects.map(async (project) => ({ project, r: await fn(project.slug) })));
  const failed = results.find((x) => !x.r.ok);
  if (failed && !failed.r.ok) return { ok: false, error: failed.r.error };
  return { ok: true, data: results.flatMap(({ project, r }) => (r.ok ? r.data.map((row) => ({ ...row, project })) : [])) };
}

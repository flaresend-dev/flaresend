import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { ProjectRecord } from "@flaresend/types";
import { mailerCall } from "./mailer";

/**
 * The project for a `[slug]` page. The layout already 404s unknown slugs; pages call this for the record itself.
 * `cache` dedupes the call within one request.
 */
export const getProjectOr404 = cache(async (slug: string): Promise<ProjectRecord> => {
  const r = await mailerCall((m) => m.getProject(slug));
  if (!r.ok) notFound();
  return r.data;
});

export type SlugParams = { params: Promise<{ slug: string }> };
export type SearchParamsProp = { searchParams: Promise<Record<string, string | string[] | undefined>> };

"use client";

import { usePathname } from "next/navigation";
import { link, viewFromPath, type ProjectSection } from "./nav";

/**
 * `link()` for client components: links to project `slug`'s pages that stay in the current view, so a webhook
 * opened from "All projects" keeps the "All projects" sidebar.
 */
export function useLink(slug: string): (section: ProjectSection, ...rest: string[]) => string {
  const view = viewFromPath(usePathname() ?? "");
  return (section, ...rest) => link(view, slug, section, ...rest);
}

import * as React from "react";
import type { ProjectRecord } from "@flaresend/types";
import { Sidebar } from "./sidebar-nav";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { ALL_PROJECTS, type ShellProject } from "./project-switcher";

function toShell(p: ProjectRecord): ShellProject {
  return { slug: p.slug, name: p.name, paused: Boolean(p.disabledAt) };
}

/**
 * Sidebar + content frame. With `project` (or `all`, the "All projects" view) the sidebar has the switcher and the
 * nav; without either (the /projects pages) it shows only "Projects".
 */
export function AppShell({ project, all, projects, children }: {
  project?: ProjectRecord;
  all?: boolean;
  projects: ProjectRecord[];
  children: React.ReactNode;
}) {
  const current = all ? ALL_PROJECTS : project ? toShell(project) : undefined;
  const list = projects.map(toShell);
  return (
    <div className="min-h-dvh md:flex">
      <MobileNav project={current} projects={list} />
      <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 border-r border-border bg-background-subtle md:block">
        <Sidebar project={current} projects={list} />
      </aside>
      <main className="min-w-0 flex-1">
        <div className="fs-shell-content max-w-[1120px] px-4 py-6 md:px-10 md:py-8">{children}</div>
      </main>
      {current ? <CommandPalette project={current} projects={list} /> : null}
    </div>
  );
}

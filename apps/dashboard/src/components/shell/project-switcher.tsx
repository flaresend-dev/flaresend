"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import { activeSection, p } from "@/lib/nav";
import {
  DropdownMenu, DropdownMenuCheckItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ShellProject {
  slug: string;
  name: string;
  paused: boolean;
}

export function ProjectAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border border-border-strong bg-background-elevated text-xs font-semibold text-foreground shadow-card",
        className,
      )}
      aria-hidden
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Top of the sidebar: current project name + slug, dropdown to switch. Keeps the current section when switching. */
export function ProjectSwitcher({ current, projects }: { current: ShellProject; projects: ShellProject[] }) {
  const router = useRouter();
  const section = activeSection(usePathname() ?? "") ?? "emails";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-background-hover"
        >
          <ProjectAvatar name={current.name} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">{current.name}</span>
              {current.paused ? <Badge tone="danger" className="h-4 px-1 text-2xs">Paused</Badge> : null}
            </span>
            <span className="truncate font-mono text-2xs text-foreground-subtle">{current.slug}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-foreground-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.map((pr) => (
          <DropdownMenuCheckItem key={pr.slug} checked={pr.slug === current.slug} onSelect={() => router.push(p(pr.slug, section))} className="h-auto py-1.5">
            <ProjectAvatar name={pr.name} className="size-5 text-2xs shadow-none" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate">{pr.name}</span>
              <span className="truncate font-mono text-2xs text-foreground-subtle">{pr.slug}</span>
            </span>
          </DropdownMenuCheckItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/projects/new")}>
          <Plus /> New project
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/projects")}>
          <LayoutGrid /> All projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

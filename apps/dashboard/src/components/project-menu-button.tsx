"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { ALL, link, type ProjectSection } from "@/lib/nav";
import { useAutoOpen } from "@/lib/use-auto-open";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PickerProject } from "./project-field";

/**
 * "New …" button of the "All projects" view for things made on their own page (templates, broadcasts): pick the
 * project, then go to `/all/{section}/{slug}/{rest}`. `?new=1` opens the menu, like the dialogs.
 */
export function ProjectMenuButton({ label, projects, section, rest }: { label: string; projects: PickerProject[]; section: ProjectSection; rest: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useAutoOpen("new");
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="primary" disabled={!projects.length}>
          <Plus /> {label} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>For project</DropdownMenuLabel>
        {projects.map((pr) => (
          <DropdownMenuItem key={pr.slug} onSelect={() => router.push(link(ALL, pr.slug, section, ...rest))}>
            <span className="truncate">{pr.name}</span>
            {pr.disabledAt ? <span className="ml-auto text-xs text-foreground-subtle">Paused</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

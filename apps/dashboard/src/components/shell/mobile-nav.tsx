"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "./icons";
import { Sidebar } from "./sidebar-nav";
import type { ShellProject } from "./project-switcher";

/** Phone (<768px): a top bar with the project name; the hamburger opens the sidebar in a left sheet. */
export function MobileNav({ project, projects }: { project?: ShellProject; projects: ShellProject[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background-subtle/95 px-2 backdrop-blur md:hidden">
      <button type="button" aria-label="Open navigation" className={buttonVariants({ variant: "ghost", size: "icon" })} onClick={() => setOpen(true)}>
        <Menu />
      </button>
      <Logo className="size-5" />
      <span className="truncate text-sm font-semibold">{project?.name ?? "Flaresend"}</span>
      <Sheet open={open} onOpenChange={setOpen} side="left" title="Navigation" className="[&>div:first-child]:hidden [&>div:nth-child(2)]:p-0">
        <Sidebar project={project} projects={projects} onNavigate={() => setOpen(false)} />
      </Sheet>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, FolderOpen, Search } from "lucide-react";
import { NAV, activeSection, p } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Logo, NAV_ICONS } from "./icons";
import { ProjectSwitcher, type ShellProject } from "./project-switcher";
import { ThemeToggle } from "./theme-toggle";
import { openCommandPalette } from "./command-palette";

const itemClass =
  "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function NavLink({ href, active, icon: Icon, children, onNavigate }: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        itemClass,
        active ? "bg-background-hover font-medium text-foreground" : "text-foreground-muted hover:bg-background-hover hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-foreground-subtle group-hover:text-foreground-muted")} />
      <span className="flex-1 truncate">{children}</span>
      {active ? <span className="size-1.5 rounded-full bg-brand" aria-hidden /> : null}
    </Link>
  );
}

/**
 * Sidebar body, shared by the desktop sidebar and the phone sheet. Without `project` (the /projects pages) it shows
 * only the logo and "Projects".
 */
export function Sidebar({ project, projects, onNavigate }: { project?: ShellProject; projects: ShellProject[]; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const section = activeSection(pathname);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        {project ? (
          <ProjectSwitcher current={project} projects={projects} />
        ) : (
          <Link href="/" className="flex items-center gap-2.5 rounded-md p-1.5" onClick={onNavigate}>
            <Logo className="size-7" />
            <span className="text-sm font-semibold tracking-tight">Flaresend</span>
          </Link>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3" aria-label="Main">
        {project ? (
          NAV.map((group, i) => (
            <ul key={i} className={cn("flex flex-col gap-0.5", i > 0 && "border-t border-border pt-4")}>
              {group.map((item) => (
                <li key={item.id}>
                  <NavLink href={p(project.slug, item.id)} active={section === item.id} icon={NAV_ICONS[item.id]} onNavigate={onNavigate}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          ))
        ) : (
          <ul className="flex flex-col gap-0.5">
            <li>
              <NavLink href="/projects" active={pathname.startsWith("/projects")} icon={FolderOpen} onNavigate={onNavigate}>
                Projects
              </NavLink>
            </li>
          </ul>
        )}
      </nav>

      <div className="flex flex-col gap-2 border-t border-border p-3">
        <div className="flex items-center gap-1">
          {project ? (
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                openCommandPalette();
              }}
              className={cn(itemClass, "flex-1 text-foreground-muted hover:bg-background-hover hover:text-foreground")}
            >
              <Search className="size-4 text-foreground-subtle" />
              <span className="flex-1 text-left">Search</span>
              <Kbd suppressHydrationWarning>{mac ? "⌘K" : "Ctrl K"}</Kbd>
            </button>
          ) : (
            <span className="flex-1" />
          )}
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-1 px-2 text-xs text-foreground-subtle">
          <a href="https://github.com/flaresend-dev/flaresend#readme" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
            Docs <ArrowUpRight className="size-3" />
          </a>
          <span aria-hidden>·</span>
          <a
            href="https://one.dash.cloudflare.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 hover:text-foreground"
            title="Sign-in is handled by Cloudflare Access"
          >
            Admin (Access) <ArrowUpRight className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

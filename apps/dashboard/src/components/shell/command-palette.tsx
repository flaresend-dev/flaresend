"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ArrowRight, KeyRound, Mail, Plus, Radio, Search, Send, UserPlus, Webhook } from "lucide-react";
import { ALL, ALL_SECTIONS, NAV_ITEMS, p } from "@/lib/nav";
import { EMAIL_ID_RE } from "@/lib/search";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { NAV_ICONS } from "./icons";
import { ALL_PROJECTS, ProjectAvatar, type ShellProject } from "./project-switcher";

const OPEN_EVENT = "fs:command-palette";

/** Opens the palette from anywhere (the sidebar "Search" row uses this). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || Boolean(el.closest(".cm-editor"));
}

const itemClass =
  "flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground outline-none " +
  "data-[selected=true]:bg-background-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-foreground-muted";
const groupClass =
  "px-1.5 pb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-foreground-subtle";

/**
 * ⌘K / Ctrl+K: pages of the current project, project switching, common actions. Also handles `/` (focus the page's
 * search box, marked with `data-page-search`).
 */
export function CommandPalette({ project, projects }: { project: ShellProject; projects: ShellProject[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        const box = document.querySelector<HTMLInputElement>("[data-page-search]");
        if (box) {
          e.preventDefault();
          box.focus();
          box.select();
        }
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setSearch("");
    router.push(href);
  };

  const q = search.trim();
  const slug = project.slug;
  const isAll = slug === ALL;
  const pages = isAll ? NAV_ITEMS.filter((n) => ALL_SECTIONS.includes(n.id)) : NAV_ITEMS;
  // Every action creates something in one project, so the "All projects" view has none.
  const actions = isAll ? [] : [
    { label: "New broadcast", icon: Radio, href: p(slug, "broadcasts", "new") },
    { label: "Create API key", icon: KeyRound, href: `${p(slug, "api-keys")}?new=1` },
    { label: "Add webhook", icon: Webhook, href: `${p(slug, "webhooks")}?new=1` },
    { label: "Add contact", icon: UserPlus, href: `${p(slug, "contacts")}?new=1` },
    { label: "Send test email", icon: Send, href: `${p(slug, "emails")}?send=1` },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
    >
      <DialogContent size="lg" className="top-[15vh] p-0 [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command loop className="flex max-h-[60vh] flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-foreground-subtle" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search pages, projects, actions, or paste an email ID…"
              className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-subtle"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="min-h-0 flex-1 overflow-y-auto py-1.5">
            <Command.Empty className="px-4 py-8 text-center text-sm text-foreground-muted">No results.</Command.Empty>

            {EMAIL_ID_RE.test(q) ? (
              <Command.Group heading="Email" className={groupClass} forceMount>
                <Command.Item value={`open ${q}`} forceMount className={itemClass} onSelect={() => go(p(slug, "emails", q))}>
                  <Mail /> Open email <span className="font-mono text-xs text-foreground-muted">{q}</span>
                </Command.Item>
              </Command.Group>
            ) : null}
            {q.includes("@") ? (
              <Command.Group heading="Emails" className={groupClass} forceMount>
                <Command.Item value={`to ${q}`} forceMount className={itemClass} onSelect={() => go(`${p(slug, "emails")}?to=${encodeURIComponent(q)}`)}>
                  <Search /> Search emails to <span className="font-mono text-xs text-foreground-muted">{q}</span>
                </Command.Item>
              </Command.Group>
            ) : null}

            <Command.Group heading="Pages" className={groupClass}>
              {pages.map((n) => {
                const Icon = NAV_ICONS[n.id];
                return (
                  <Command.Item key={n.id} value={`page ${n.label}`} className={itemClass} onSelect={() => go(p(slug, n.id))}>
                    <Icon /> {n.label}
                  </Command.Item>
                );
              })}
            </Command.Group>

            <Command.Group heading="Projects" className={groupClass}>
              {[ALL_PROJECTS, ...projects].map((pr) => (
                <Command.Item key={pr.slug} value={`project ${pr.name} ${pr.slug}`} className={itemClass} onSelect={() => go(p(pr.slug, "emails"))}>
                  <ProjectAvatar name={pr.name} all={pr.slug === ALL} className="size-5 text-2xs shadow-none" />
                  <span className="truncate">{pr.name}</span>
                  {pr.slug === ALL ? null : <span className="font-mono text-xs text-foreground-subtle">{pr.slug}</span>}
                  {pr.slug === slug ? <span className="ml-auto text-xs text-foreground-subtle">Current</span> : <ArrowRight className="ml-auto" />}
                </Command.Item>
              ))}
              <Command.Item value="project new create" className={itemClass} onSelect={() => go("/projects/new")}>
                <Plus /> New project
              </Command.Item>
            </Command.Group>

            {actions.length ? (
              <Command.Group heading="Actions" className={groupClass}>
                {actions.map((a) => (
                  <Command.Item key={a.label} value={`action ${a.label}`} className={itemClass} onSelect={() => go(a.href)}>
                    <a.icon /> {a.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

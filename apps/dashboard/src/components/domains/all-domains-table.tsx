"use client";

import { Fragment, useState } from "react";
import { AtSign, CloudCog, Trash2 } from "lucide-react";
import type { AllDomainRecord, DomainProjectRef, ProjectRecord } from "@flaresend/types";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, MoreButton } from "@/components/ui/dropdown-menu";
import { DetailList, Sheet } from "@/components/ui/sheet";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { DomainSenderDialog, RemoveDomainDialog, VerifyButton, statusBadge } from "./domains-table";
import { SetupDomainDialog } from "./setup-domain";

function ProjectNames({ projects }: { projects: DomainProjectRef[] }) {
  return (
    <>
      {projects.map((pr, i) => (
        <span key={pr.slug}>
          {i > 0 ? ", " : null}
          {pr.name}
          {pr.paused ? <span className="text-foreground-subtle"> (paused)</span> : null}
        </span>
      ))}
    </>
  );
}

type Target = { domain: string; project: DomainProjectRef };

/**
 * Domains of every project, one row per domain. A domain can be allowed in several projects, so the sender and
 * Remove act on one project each (picked in the row menu or the detail sheet). Cloudflare setup is per domain.
 */
export function AllDomainsTable({ domains, projects }: { domains: AllDomainRecord[]; projects: ProjectRecord[] }) {
  const [open, setOpen] = useState<AllDomainRecord | null>(null);
  const [editingSender, setEditingSender] = useState<Target | null>(null);
  const [removing, setRemoving] = useState<Target | null>(null);
  const [settingUp, setSettingUp] = useState<Target | null>(null);
  const bySlug = new Map(projects.map((pr) => [pr.slug, pr]));
  const ownSender = (t: Target) => bySlug.get(t.project.slug)?.domainSenders[t.domain] ?? null;
  const isLast = (t: Target) => (bySlug.get(t.project.slug)?.allowedDomains.length ?? 0) <= 1;

  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH className="w-[30%]">Domain</TH>
            <TH className="w-[140px]">Status</TH>
            <TH className="hidden md:table-cell">Projects</TH>
            <TH className="w-[110px]">Checked</TH>
            <TH className="w-[124px]">
              <span className="sr-only">Actions</span>
            </TH>
          </tr>
        </THead>
        <TBody>
          {domains.map((d) => (
            <tr
              key={d.domain}
              className="cursor-pointer transition-colors hover:bg-background-hover"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button,a,[role=menu]")) return;
                setOpen(d);
              }}
            >
              <TD className="truncate font-mono text-xs">
                <button type="button" className="truncate text-left hover:underline" onClick={() => setOpen(d)}>
                  {d.domain}
                </button>
              </TD>
              <TD>{statusBadge(d)}</TD>
              <TD className="hidden truncate text-foreground-muted md:table-cell">
                <ProjectNames projects={d.projects} />
              </TD>
              <TD className="text-foreground-muted">
                <Time iso={d.checkedAt ?? null} />
              </TD>
              <TD>
                <span className="flex items-center justify-end gap-1">
                  <VerifyButton />
                  <DropdownMenu>
                    <MoreButton label={`Actions for ${d.domain}`} />
                    <DropdownMenuContent className="w-60">
                      <DropdownMenuItem onSelect={() => d.projects[0] && setSettingUp({ domain: d.domain, project: d.projects[0] })}>
                        <CloudCog /> Set up in Cloudflare
                      </DropdownMenuItem>
                      {d.projects.map((pr) => (
                        <Fragment key={pr.slug}>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="truncate">{pr.name}</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => setEditingSender({ domain: d.domain, project: pr })}>
                            <AtSign /> Default sender…
                          </DropdownMenuItem>
                          <DropdownMenuItem tone="danger" onSelect={() => setRemoving({ domain: d.domain, project: pr })}>
                            <Trash2 /> Remove from {pr.name}…
                          </DropdownMenuItem>
                        </Fragment>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)} title={<span className="font-mono">{open?.domain}</span>} description="Verification details from Cloudflare Email Sending.">
        {open ? (
          <div className="flex flex-col gap-5">
            <DetailList
              items={[
                ["Status", statusBadge(open)],
                ["Checked", <Time key="c" iso={open.checkedAt ?? null} format="absolute" />],
              ]}
            />
            {open.verification !== "onboarded" && open.projects[0] ? (
              <div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSettingUp({ domain: open.domain, project: open.projects[0]! });
                    setOpen(null);
                  }}
                >
                  <CloudCog /> Set up in Cloudflare
                </Button>
              </div>
            ) : null}
            <div>
              <h3 className="mb-2 text-sm font-medium">Used by</h3>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {open.projects.map((pr) => {
                  const t = { domain: open.domain, project: pr };
                  return (
                    <li key={pr.slug} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">
                          {pr.name}
                          {pr.paused ? <span className="text-foreground-subtle"> (paused)</span> : null}
                        </span>
                        <span className="truncate text-xs text-foreground-muted">
                          {pr.defaultFrom ?? "No default sender"}
                          {pr.defaultFrom && !ownSender(t) ? " (project default)" : null}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingSender(t);
                          setOpen(null);
                        }}
                      >
                        Sender
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${open.domain} from ${pr.name}`}
                        onClick={() => {
                          setRemoving(t);
                          setOpen(null);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {open.details ? (
              <CodeBlock code={JSON.stringify(open.details, null, 2)} maxHeight="60vh" />
            ) : (
              <p className="text-sm text-foreground-muted">No details. Press Verify to check with Cloudflare now.</p>
            )}
          </div>
        ) : null}
      </Sheet>

      {editingSender ? (
        <DomainSenderDialog
          slug={editingSender.project.slug}
          domain={{ domain: editingSender.domain }}
          current={ownSender(editingSender)}
          onOpenChange={(v) => !v && setEditingSender(null)}
        />
      ) : null}

      {settingUp ? <SetupDomainDialog slug={settingUp.project.slug} domain={settingUp.domain} open onOpenChange={(v) => !v && setSettingUp(null)} /> : null}

      <RemoveDomainDialog
        slug={removing?.project.slug ?? ""}
        domain={removing?.domain ?? null}
        last={removing ? isLast(removing) : false}
        projectName={removing?.project.name}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

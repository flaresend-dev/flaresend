"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AllDomainRecord } from "@flaresend/types";
import { p } from "@/lib/nav";
import { CodeBlock } from "@/components/ui/code";
import { DetailList, Sheet } from "@/components/ui/sheet";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { statusBadge } from "./domains-table";

function ProjectNames({ projects }: { projects: AllDomainRecord["projects"] }) {
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

/**
 * Domains of every project, one row per domain. Changes (sender, setup, remove) belong to one project, so the
 * detail sheet links to each project's Domains page instead of repeating those controls here.
 */
export function AllDomainsTable({ domains }: { domains: AllDomainRecord[] }) {
  const [open, setOpen] = useState<AllDomainRecord | null>(null);

  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH className="w-[30%]">Domain</TH>
            <TH className="w-[140px]">Status</TH>
            <TH className="hidden md:table-cell">Projects</TH>
            <TH className="w-[110px]">Checked</TH>
          </tr>
        </THead>
        <TBody>
          {domains.map((d) => (
            <tr
              key={d.domain}
              className="cursor-pointer transition-colors hover:bg-background-hover"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button,a")) return;
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
            <div>
              <h3 className="mb-2 text-sm font-medium">Used by</h3>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {open.projects.map((pr) => (
                  <li key={pr.slug}>
                    <Link href={p(pr.slug, "domains")} className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-background-hover">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">
                          {pr.name}
                          {pr.paused ? <span className="text-foreground-subtle"> (paused)</span> : null}
                        </span>
                        <span className="truncate text-xs text-foreground-muted">{pr.defaultFrom ?? "No default sender"}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-foreground-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
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
    </>
  );
}

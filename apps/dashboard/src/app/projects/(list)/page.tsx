import { FolderOpen, Plus } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { p } from "@/lib/nav";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { ProjectAvatar } from "@/components/shell/project-switcher";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = await mailerCall((m) => m.listProjects());
  const newButton = (
    <LinkButton href="/projects/new" variant="primary">
      <Plus /> New project
    </LinkButton>
  );
  return (
    <>
      <PageHeader title="Projects" description="Each project has its own domains, API keys, webhooks, templates and contacts." actions={newButton} />
      {!projects.ok ? (
        <PageError error={projects.error} title="Could not load projects" />
      ) : projects.data.length === 0 ? (
        <EmptyState icon={<FolderOpen />} title="Create your first project" action={newButton}>
          A project is one sending app: its own domains, API keys and settings.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH className="w-[26%]">Project</TH>
              <TH className="w-[22%]">Domains</TH>
              <TH className="hidden w-[22%] md:table-cell">Default sender</TH>
              <TH className="w-[12%]">Daily limit</TH>
              <TH className="w-[12%]">Status</TH>
              <TH className="hidden w-[12%] md:table-cell">Created</TH>
            </tr>
          </THead>
          <TBody>
            {projects.data.map((pr) => (
              <TR key={pr.id} href={p(pr.slug, "emails")} label={`Open ${pr.name}`}>
                <TD>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ProjectAvatar name={pr.name} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate font-medium">{pr.name}</span>
                      <span className="truncate font-mono text-xs text-foreground-subtle">{pr.slug}</span>
                    </span>
                  </span>
                </TD>
                <TD className="truncate font-mono text-xs">
                  {pr.allowedDomains[0]}
                  {pr.allowedDomains.length > 1 ? <span className="text-foreground-subtle"> +{pr.allowedDomains.length - 1}</span> : null}
                </TD>
                <TD className="hidden truncate text-foreground-muted md:table-cell">{pr.defaultFrom ?? "—"}</TD>
                <TD className="tabular-nums">{pr.dailyLimit ? num(pr.dailyLimit) : <span className="text-foreground-muted">Unlimited</span>}</TD>
                <TD>{pr.disabledAt ? <StatusBadge status="paused" label="Paused" /> : <StatusBadge status="active" />}</TD>
                <TD className="hidden text-foreground-muted md:table-cell">
                  <Time iso={pr.createdAt} format="date" />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

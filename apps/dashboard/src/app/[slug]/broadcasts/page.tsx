import { Plus, Radio } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { linker, listAcross, projectsFor, type SlugParams } from "@/lib/project";
import { num } from "@/lib/format";
import { ALL } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { BroadcastNotices } from "@/components/broadcasts/notices";
import { Progress } from "@/components/broadcasts/progress";
import { ProjectTD, ProjectTH } from "@/components/project-name";
import { ProjectMenuButton } from "@/components/project-menu-button";

export const metadata = { title: "Broadcasts" };

/** One project's broadcasts, or every project's when `slug` is ALL (the "All projects" view), newest first. */
export default async function BroadcastsPage({ params }: SlugParams) {
  const { slug, view } = await params;
  const isAll = slug === ALL;
  const projects = await projectsFor(slug);
  const scope = projects.ok ? projects.data : [];
  const [list, audiences] = await Promise.all([
    projects.ok ? listAcross(scope, (s) => mailerCall((m) => m.listBroadcasts(s))) : projects,
    listAcross(scope, (s) => mailerCall((m) => m.listAudiences(s))),
  ]);
  if (list.ok && isAll) list.data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const audienceName = new Map(audiences.ok ? audiences.data.map((a) => [a.id, a.name]) : []);
  const newButton = isAll ? (
    <ProjectMenuButton label="New broadcast" projects={scope} section="broadcasts" rest={["new"]} />
  ) : (
    <LinkButton href={linker(slug, view)("broadcasts", "new")} variant="primary">
      <Plus /> New broadcast
    </LinkButton>
  );

  return (
    <>
      <PageHeader title="Broadcasts" actions={newButton} />
      <BroadcastNotices slug={slug} view={view} enabled={isAll || (scope[0]?.broadcastsEnabled ?? true)} />
      {!list.ok ? (
        <PageError error={list.error} title="Could not load broadcasts" />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<Radio />} title="No broadcasts yet" action={newButton}>
          Send one email to every subscribed contact in an audience.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Subject</TH>
              {isAll ? <ProjectTH /> : null}
              <TH className="w-[140px]">Status</TH>
              <TH className="w-[200px]">Recipients</TH>
              <TH className="hidden w-[110px] text-right md:table-cell">Sent</TH>
            </tr>
          </THead>
          <TBody>
            {list.data.map((b) => (
              <TR key={b.id} href={linker(b.project.slug, view)("broadcasts", b.id)} label={`Open broadcast ${b.subject}`}>
                <TD>
                  <span className="block truncate font-medium">{b.subject || <span className="text-foreground-subtle">(no subject)</span>}</span>
                  <span className="block truncate text-xs text-foreground-muted">{audienceName.get(b.audienceId) ?? "Deleted audience"}</span>
                </TD>
                {isAll ? <ProjectTD project={b.project} /> : null}
                <TD>
                  <StatusBadge status={b.status} />
                </TD>
                <TD>{b.status === "sending" ? <Progress sent={b.sent} total={b.total} /> : <span className="tabular-nums text-foreground-muted">{b.total ? num(b.total) : "—"}</span>}</TD>
                <TD className="hidden text-right text-foreground-muted md:table-cell">
                  <Time iso={b.scheduledAt ?? b.startedAt ?? b.updatedAt} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

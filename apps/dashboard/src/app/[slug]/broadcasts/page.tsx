import { Plus, Radio } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, type SlugParams } from "@/lib/project";
import { num } from "@/lib/format";
import { p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { BroadcastNotices } from "@/components/broadcasts/notices";
import { Progress } from "@/components/broadcasts/progress";

export const metadata = { title: "Broadcasts" };

export default async function BroadcastsPage({ params }: SlugParams) {
  const { slug } = await params;
  const project = await getProjectOr404(slug);
  const [list, audiences] = await Promise.all([mailerCall((m) => m.listBroadcasts(slug)), mailerCall((m) => m.listAudiences(slug))]);
  const audienceName = new Map(audiences.ok ? audiences.data.map((a) => [a.id, a.name]) : []);
  const newButton = (
    <LinkButton href={p(slug, "broadcasts", "new")} variant="primary">
      <Plus /> New broadcast
    </LinkButton>
  );

  return (
    <>
      <PageHeader title="Broadcasts" actions={newButton} />
      <BroadcastNotices slug={slug} enabled={project.broadcastsEnabled} />
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
              <TH className="w-[140px]">Status</TH>
              <TH className="w-[200px]">Recipients</TH>
              <TH className="hidden w-[110px] text-right md:table-cell">Sent</TH>
            </tr>
          </THead>
          <TBody>
            {list.data.map((b) => (
              <TR key={b.id} href={p(slug, "broadcasts", b.id)} label={`Open broadcast ${b.subject}`}>
                <TD>
                  <span className="block truncate font-medium">{b.subject || <span className="text-foreground-subtle">(no subject)</span>}</span>
                  <span className="block truncate text-xs text-foreground-muted">{audienceName.get(b.audienceId) ?? "Deleted audience"}</span>
                </TD>
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

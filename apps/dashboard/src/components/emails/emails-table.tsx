import type { EmailRecord, ProjectRecord } from "@flaresend/types";
import { p } from "@/lib/nav";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Time } from "@/components/ui/time";
import { Tooltip } from "@/components/ui/tooltip";
import { ProjectTD, ProjectTH } from "@/components/project-name";

function Recipients({ e }: { e: EmailRecord }) {
  const all = [...e.to, ...e.cc, ...e.bcc];
  const extra = all.length - 1;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{all[0] ?? "—"}</span>
      {extra > 0 ? (
        <Tooltip content={<span className="flex flex-col font-mono">{all.map((a) => <span key={a}>{a}</span>)}</span>}>
          <span className="relative z-10 shrink-0 text-xs text-foreground-subtle tabular-nums">+{extra}</span>
        </Tooltip>
      ) : null}
      {e.mode === "test" ? <Badge className="shrink-0">Test</Badge> : null}
    </span>
  );
}

/**
 * The Emails list. `slug` is the URL scope rows link into (a project, or ALL). With `projects` (the "All projects"
 * view) it adds a Project column.
 */
export function EmailsTable({ slug, rows, projects }: { slug: string; rows: EmailRecord[]; projects?: Map<string, ProjectRecord> }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH className="w-[34%] md:w-[30%]">To</TH>
          <TH className="w-[150px]">Status</TH>
          {projects ? <ProjectTH /> : null}
          <TH className="hidden md:table-cell">Subject</TH>
          <TH className="w-[110px] text-right">Sent</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((e) => {
          const project = projects?.get(e.projectId);
          return (
            <TR key={e.id} href={p(slug, "emails", e.id)} label={`Open email to ${e.to[0] ?? ""}: ${e.subject}`}>
              <TD>
                <Recipients e={e} />
                <span className="block truncate text-xs text-foreground-muted md:hidden">{e.subject || "(no subject)"}</span>
              </TD>
              <TD>
                <StatusBadge status={e.status} />
              </TD>
              {projects ? <ProjectTD project={project ?? { name: e.projectId, disabledAt: null }} /> : null}
              <TD className="hidden truncate md:table-cell">
                {e.subject ? e.subject : <span className="text-foreground-subtle">(no subject)</span>}
              </TD>
              <TD className="text-right text-foreground-muted">
                <Time iso={e.sentAt ?? e.createdAt} />
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

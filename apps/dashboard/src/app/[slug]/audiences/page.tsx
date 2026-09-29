import { Users } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { linker, listAcross, projectsFor, type SlugParams } from "@/lib/project";
import { num } from "@/lib/format";
import { ALL } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { AudienceMenu, NewAudienceButton } from "@/components/audiences/audience-controls";
import { ProjectTD, ProjectTH } from "@/components/project-name";

export const metadata = { title: "Audiences" };

/** One project's audiences, or every project's when `slug` is ALL (the "All projects" view). */
export default async function AudiencesPage({ params }: SlugParams) {
  const { slug, view } = await params;
  const isAll = slug === ALL;
  const projects = await projectsFor(slug);
  const audiences = projects.ok ? await listAcross(projects.data, (s) => mailerCall((m) => m.listAudiences(s))) : projects;
  const picker = isAll && projects.ok ? projects.data : undefined;
  return (
    <>
      <PageHeader title="Audiences" description="Named lists of contacts. A broadcast goes to one audience." actions={<NewAudienceButton slug={slug} projects={picker} />} />
      {!audiences.ok ? (
        <PageError error={audiences.error} title="Could not load audiences" />
      ) : audiences.data.length === 0 ? (
        <EmptyState icon={<Users />} title="No audiences yet" action={<NewAudienceButton slug={slug} projects={picker} />}>
          Create an audience to send a broadcast.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              {isAll ? <ProjectTH /> : null}
              <TH className="w-[140px]">Contacts</TH>
              <TH className="hidden w-[150px] md:table-cell">Created</TH>
              <TH className="w-[52px]">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {audiences.data.map((a) => (
              <TR key={a.id} href={linker(a.project.slug, view)("audiences", a.id)} label={`Open audience ${a.name}`}>
                <TD className="truncate font-medium">{a.name}</TD>
                {isAll ? <ProjectTD project={a.project} /> : null}
                <TD className="tabular-nums text-foreground-muted">{num(a.contactCount)}</TD>
                <TD className="hidden text-foreground-muted md:table-cell">
                  <Time iso={a.createdAt} format="date" />
                </TD>
                <TD className="text-right">
                  <AudienceMenu slug={a.project.slug} id={a.id} name={a.name} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

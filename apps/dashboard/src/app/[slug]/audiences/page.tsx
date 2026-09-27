import { Users } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import type { SlugParams } from "@/lib/project";
import { num } from "@/lib/format";
import { p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { AudienceMenu, NewAudienceButton } from "@/components/audiences/audience-controls";

export const metadata = { title: "Audiences" };

export default async function AudiencesPage({ params }: SlugParams) {
  const { slug } = await params;
  const audiences = await mailerCall((m) => m.listAudiences(slug));
  return (
    <>
      <PageHeader title="Audiences" description="Named lists of contacts. A broadcast goes to one audience." actions={<NewAudienceButton slug={slug} />} />
      {!audiences.ok ? (
        <PageError error={audiences.error} title="Could not load audiences" />
      ) : audiences.data.length === 0 ? (
        <EmptyState icon={<Users />} title="No audiences yet" action={<NewAudienceButton slug={slug} />}>
          Create an audience to send a broadcast.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH className="w-[140px]">Contacts</TH>
              <TH className="hidden w-[150px] md:table-cell">Created</TH>
              <TH className="w-[52px]">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {audiences.data.map((a) => (
              <TR key={a.id} href={p(slug, "audiences", a.id)} label={`Open audience ${a.name}`}>
                <TD className="truncate font-medium">{a.name}</TD>
                <TD className="tabular-nums text-foreground-muted">{num(a.contactCount)}</TD>
                <TD className="hidden text-foreground-muted md:table-cell">
                  <Time iso={a.createdAt} format="date" />
                </TD>
                <TD className="text-right">
                  <AudienceMenu slug={slug} id={a.id} name={a.name} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

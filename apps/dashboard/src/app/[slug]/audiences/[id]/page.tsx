import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import type { SearchParamsProp } from "@/lib/project";
import { first } from "@/lib/email-query";
import { num } from "@/lib/format";
import { p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { PageError } from "@/components/page-error";
import { AudienceMenu } from "@/components/audiences/audience-controls";
import { AddMembersButton, MembersTable } from "@/components/audiences/members";

export const metadata = { title: "Audience" };

export default async function AudiencePage({ params, searchParams }: { params: Promise<{ slug: string; id: string }> } & SearchParamsProp) {
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  const cursor = first(sp.cursor);
  const [audience, members] = await Promise.all([
    mailerCall((m) => m.getAudience(slug, id)),
    mailerCall((m) => m.listAudienceContacts(slug, id, { limit: 100, ...(cursor ? { cursor } : {}) })),
  ]);
  if (!audience.ok) {
    if (audience.error.code.includes("not_found")) notFound();
    return <PageError error={audience.error} title="Could not load this audience" />;
  }
  const a = audience.data;
  const base = p(slug, "audiences", id);
  const memberIds = members.ok ? members.data.data.map((c) => c.id) : [];

  return (
    <>
      <PageHeader
        back={{ href: p(slug, "audiences"), label: "Audiences" }}
        title={a.name}
        description={`${num(a.contactCount)} ${a.contactCount === 1 ? "contact" : "contacts"}`}
        actions={
          <>
            <AddMembersButton slug={slug} audienceId={id} memberIds={memberIds} />
            <AudienceMenu slug={slug} id={id} name={a.name} afterDelete="list" />
          </>
        }
      />
      <h2 className="mb-1 text-section font-semibold">Contacts</h2>
      {!members.ok ? (
        <PageError error={members.error} title="Could not load contacts" />
      ) : members.data.data.length === 0 ? (
        <EmptyState icon={<Users />} title={cursor ? "No more contacts" : "This audience is empty"} className="mt-3">
          Add contacts to send them a broadcast.
        </EmptyState>
      ) : (
        <>
          <MembersTable key={cursor} slug={slug} audienceId={id} members={members.data.data} />
          <CursorPagination
            count={members.data.data.length}
            hrefPrev={cursor ? base : null}
            hrefNext={members.data.nextCursor ? `${base}?cursor=${encodeURIComponent(members.data.nextCursor)}` : null}
          />
        </>
      )}
    </>
  );
}

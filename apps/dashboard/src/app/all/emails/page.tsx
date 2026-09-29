import { Inbox } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { listProjects, type SearchParamsProp } from "@/lib/project";
import { first, hasEmailFilters, toEmailQuery, withParams } from "@/lib/email-query";
import { ALL, p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { LinkButton } from "@/components/ui/button";
import { PageError } from "@/components/page-error";
import { EmailFilters } from "@/components/emails/email-filters";
import { EmailsTable } from "@/components/emails/emails-table";
import { SendTestEmailButton } from "@/components/emails/send-test-email";

export const metadata = { title: "Emails" };

/** Every project's emails, newest first. "Send test email" asks for the project, then one of its domains. */
export default async function AllEmailsPage({ searchParams }: SearchParamsProp) {
  const sp = await searchParams;
  const base = p(ALL, "emails");
  const [emails, projects, domains] = await Promise.all([
    mailerCall((m) => m.listEmails(toEmailQuery(sp))),
    listProjects(),
    mailerCall((m) => m.listAllDomains()),
  ]);
  const filtered = hasEmailFilters(sp);
  const cursor = first(sp.cursor);
  // Each project's domains, in the per-project shape the send dialog takes.
  const senders = projects.ok && domains.ok
    ? projects.data.map((pr) => ({
        ...pr,
        domains: domains.data.flatMap(({ projects: refs, ...d }) => {
          const ref = refs.find((r) => r.slug === pr.slug);
          return ref ? [{ ...d, defaultFrom: ref.defaultFrom }] : [];
        }),
      }))
    : null;
  const header = (
    <PageHeader
      title="Emails"
      description="Emails from every project, newest first."
      actions={senders?.length ? <SendTestEmailButton slug={ALL} domains={null} projects={senders} /> : null}
    />
  );

  if (!emails.ok) {
    return (
      <>
        {header}
        <PageError error={emails.error} title="Could not load emails" />
      </>
    );
  }

  const rows = emails.data.data;
  const byId = new Map(projects.ok ? projects.data.map((x) => [x.id, x]) : []);

  return (
    <>
      {header}
      <EmailFilters slug={ALL} />
      {rows.length ? (
        <>
          <EmailsTable slug={ALL} rows={rows} projects={byId} />
          <CursorPagination
            count={rows.length}
            hrefPrev={cursor ? withParams(base, sp, { cursor: null }) : null}
            hrefNext={emails.data.nextCursor ? withParams(base, sp, { cursor: emails.data.nextCursor }) : null}
          />
        </>
      ) : (
        <EmptyState
          icon={<Inbox />}
          title={filtered ? "No emails match" : cursor ? "No more emails" : "No emails yet"}
          action={
            filtered || cursor ? (
              <LinkButton href={base} variant="secondary">
                {filtered ? "Clear filters" : "Back to the first page"}
              </LinkButton>
            ) : undefined
          }
        >
          {filtered ? "Try a wider date range or fewer filters." : cursor ? undefined : "No project has sent an email yet."}
        </EmptyState>
      )}
    </>
  );
}

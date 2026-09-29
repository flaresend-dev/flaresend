import { Inbox } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import type { SearchParamsProp } from "@/lib/project";
import { first, hasEmailFilters, toEmailQuery, withParams } from "@/lib/email-query";
import { ALL, p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { LinkButton } from "@/components/ui/button";
import { PageError } from "@/components/page-error";
import { EmailFilters } from "@/components/emails/email-filters";
import { EmailsTable } from "@/components/emails/emails-table";

export const metadata = { title: "Emails" };

/** Every project's emails, newest first. Sending a test email needs a project, so that button stays on project pages. */
export default async function AllEmailsPage({ searchParams }: SearchParamsProp) {
  const sp = await searchParams;
  const base = p(ALL, "emails");
  const [emails, projects] = await Promise.all([
    mailerCall((m) => m.listEmails(toEmailQuery(sp))),
    mailerCall((m) => m.listProjects()),
  ]);
  const filtered = hasEmailFilters(sp);
  const cursor = first(sp.cursor);
  const header = <PageHeader title="Emails" description="Emails from every project, newest first." />;

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

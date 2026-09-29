import { Inbox } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, type SearchParamsProp, type SlugParams } from "@/lib/project";
import { first, hasEmailFilters, toEmailQuery, withParams } from "@/lib/email-query";
import { p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { LinkButton } from "@/components/ui/button";
import { PageError } from "@/components/page-error";
import { EmailFilters } from "@/components/emails/email-filters";
import { SendTestEmailButton } from "@/components/emails/send-test-email";
import { EmailsOnboarding } from "@/components/emails/onboarding";
import { EmailsTable } from "@/components/emails/emails-table";

export const metadata = { title: "Emails" };

export default async function EmailsPage({ params, searchParams }: SlugParams & SearchParamsProp) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const project = await getProjectOr404(slug);
  const base = p(slug, "emails");
  const [emails, domains] = await Promise.all([
    mailerCall((m) => m.listEmails(toEmailQuery(sp, { project: slug }))),
    mailerCall((m) => m.listDomains(slug)),
  ]);
  const filtered = hasEmailFilters(sp);
  const cursor = first(sp.cursor);

  const header = <PageHeader title="Emails" actions={<SendTestEmailButton slug={slug} domains={domains.ok ? domains.data : null} />} />;

  if (!emails.ok) {
    return (
      <>
        {header}
        <PageError error={emails.error} title="Could not load emails" />
      </>
    );
  }

  const rows = emails.data.data;
  if (!rows.length && !filtered && !cursor) {
    const keys = await mailerCall((m) => m.listApiKeys(slug));
    return (
      <>
        {header}
        <EmailsOnboarding project={project} domains={domains.ok ? domains.data : null} keys={keys.ok ? keys.data : null} />
      </>
    );
  }

  return (
    <>
      {header}
      <EmailFilters slug={slug} />
      {rows.length ? (
        <>
          <EmailsTable slug={slug} rows={rows} />
          <CursorPagination
            count={rows.length}
            hrefPrev={cursor ? withParams(base, sp, { cursor: null }) : null}
            hrefNext={emails.data.nextCursor ? withParams(base, sp, { cursor: emails.data.nextCursor }) : null}
          />
        </>
      ) : (
        <EmptyState
          icon={<Inbox />}
          title={cursor && !filtered ? "No more emails" : "No emails match"}
          action={
            <LinkButton href={base} variant="secondary">
              {filtered ? "Clear filters" : "Back to the first page"}
            </LinkButton>
          }
        >
          {filtered ? "Try a wider date range or fewer filters." : undefined}
        </EmptyState>
      )}
    </>
  );
}

import { Inbox } from "lucide-react";
import type { EmailRecord } from "@flaresend/types";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, type SearchParamsProp, type SlugParams } from "@/lib/project";
import { first, hasEmailFilters, toEmailQuery, withParams } from "@/lib/email-query";
import { p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { LinkButton } from "@/components/ui/button";
import { Time } from "@/components/ui/time";
import { Tooltip } from "@/components/ui/tooltip";
import { PageError } from "@/components/page-error";
import { EmailFilters } from "@/components/emails/email-filters";
import { SendTestEmailButton } from "@/components/emails/send-test-email";
import { EmailsOnboarding } from "@/components/emails/onboarding";

export const metadata = { title: "Emails" };

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
          <Table>
            <THead>
              <tr>
                <TH className="w-[34%] md:w-[30%]">To</TH>
                <TH className="w-[150px]">Status</TH>
                <TH className="hidden md:table-cell">Subject</TH>
                <TH className="w-[110px] text-right">Sent</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((e) => (
                <TR key={e.id} href={p(slug, "emails", e.id)} label={`Open email to ${e.to[0] ?? ""}: ${e.subject}`}>
                  <TD>
                    <Recipients e={e} />
                    <span className="block truncate text-xs text-foreground-muted md:hidden">{e.subject || "(no subject)"}</span>
                  </TD>
                  <TD>
                    <StatusBadge status={e.status} />
                  </TD>
                  <TD className="hidden truncate md:table-cell">
                    {e.subject ? e.subject : <span className="text-foreground-subtle">(no subject)</span>}
                  </TD>
                  <TD className="text-right text-foreground-muted">
                    <Time iso={e.sentAt ?? e.createdAt} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
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

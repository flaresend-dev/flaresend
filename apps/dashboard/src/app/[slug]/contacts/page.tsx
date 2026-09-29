import { Contact, SearchX } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { linker, type SearchParamsProp, type SlugParams } from "@/lib/project";
import { first } from "@/lib/email-query";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { CursorPagination } from "@/components/ui/pagination";
import { PageError } from "@/components/page-error";
import { SearchForm } from "@/components/search-form";
import { AddContactButton, ContactsTable } from "@/components/contacts/contact-controls";
import { CSV_HEADER, ImportCsvButton } from "@/components/csv-import";

export const metadata = { title: "Contacts" };

/** `picker`: the project picker of the "All projects" view, shown under the header. */
export default async function ContactsPage({ params, searchParams, picker }: SlugParams & SearchParamsProp & { picker?: React.ReactNode }) {
  const [{ slug, view }, sp] = await Promise.all([params, searchParams]);
  const to = linker(slug, view);
  const q = first(sp.q);
  const cursor = first(sp.cursor);
  const contacts = await mailerCall((m) => m.listContacts(slug, { limit: 50, ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) }));
  const base = to("contacts");
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...extra });
    return u.toString() ? `${base}?${u}` : base;
  };
  const actions = (
    <>
      <ImportCsvButton slug={slug} />
      <AddContactButton slug={slug} />
    </>
  );
  const empty = contacts.ok && contacts.data.data.length === 0 && !q && !cursor;

  return (
    <>
      <PageHeader title="Contacts" description="People who opted in to your broadcasts. Unsubscribed contacts are always skipped." actions={actions} />
      {picker}
      {!contacts.ok ? (
        <PageError error={contacts.error} title="Could not load contacts" />
      ) : empty ? (
        <EmptyState
          icon={<Contact />}
          title="No contacts yet"
          action={
            <>
              <ImportCsvButton slug={slug} />
              <AddContactButton slug={slug} autoOpen={false} />
            </>
          }
          extra={
            <p className="text-center text-xs text-foreground-muted">
              CSV header: <code className="rounded-sm border border-border bg-background-elevated px-1 py-px font-mono">{CSV_HEADER}</code>
            </p>
          }
        >
          Add people one by one, or import a CSV file.
        </EmptyState>
      ) : (
        <>
          <SearchForm q={q} placeholder="Search contacts" />
          {contacts.data.data.length ? (
            <>
              <ContactsTable slug={slug} contacts={contacts.data.data} />
              <CursorPagination
                count={contacts.data.data.length}
                hrefPrev={cursor ? qs({}) : null}
                hrefNext={contacts.data.nextCursor ? qs({ cursor: contacts.data.nextCursor }) : null}
              />
            </>
          ) : (
            <EmptyState
              icon={<SearchX />}
              title={q ? "No contacts match" : "No more contacts"}
              action={
                <LinkButton href={base} variant="secondary">
                  {q ? "Clear search" : "Back to the first page"}
                </LinkButton>
              }
            />
          )}
        </>
      )}
    </>
  );
}

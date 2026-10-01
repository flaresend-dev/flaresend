import { Plus, Newspaper } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, type SlugParams } from "@/lib/project";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError } from "@/components/page-error";
import { Time } from "@/components/ui/time";
import { StatusBadge } from "@/components/ui/badge";
export const metadata = { title: "Newsletters" };
export default async function NewslettersPage({
  params,
  searchParams,
}: SlugParams & { searchParams: Promise<{ cursor?: string }> }) {
  const { slug } = await params;
  await getProjectOr404(slug);
  const { cursor } = await searchParams;
  const list = await mailerCall((m) => m.listPublications(slug, { cursor }));
  const action = (
    <LinkButton href={`/${slug}/newsletters/new`} variant="primary">
      <Plus /> New newsletter
    </LinkButton>
  );
  return (
    <>
      <PageHeader
        title="Newsletters"
        description="Write posts, collect subscribers, and send by email or publish on the web."
        actions={action}
      />
      {!list.ok ? (
        <PageError title="Could not load newsletters" error={list.error} />
      ) : !list.data.data.length ? (
        <EmptyState
          icon={<Newspaper />}
          title="Create your first newsletter"
          action={action}
        >
          Write posts, collect subscribers, and send by email or publish on the web.
        </EmptyState>
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH className="w-24">Status</TH>
                <TH className="w-28">Subscribers</TH>
                <TH className="w-28">Published</TH>
                <TH className="w-36">Last update</TH>
              </tr>
            </THead>
            <TBody>
              {list.data.data.map((p) => (
                <TR
                  key={p.id}
                  href={`/${slug}/newsletters/${p.id}`}
                  label={`Open ${p.name}`}
                >
                  <TD>
                    <strong className="block truncate font-medium">
                      {p.name}
                    </strong>
                    <span className="block truncate text-xs text-foreground-muted">
                      {p.description}
                    </span>
                  </TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                  <TD className="tabular-nums">{p.subscriberCount.toLocaleString()}</TD>
                  <TD className="tabular-nums">{p.postCount.toLocaleString()}</TD>
                  <TD>
                    <Time iso={p.updatedAt} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {list.data.nextCursor ? (
            <LinkButton
              href={`/${slug}/newsletters?cursor=${encodeURIComponent(list.data.nextCursor)}`}
              className="mt-4"
            >
              Next page
            </LinkButton>
          ) : null}
        </>
      )}
    </>
  );
}

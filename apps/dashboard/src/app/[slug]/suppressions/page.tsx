import { Ban, SearchX } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import type { SearchParamsProp, SlugParams } from "@/lib/project";
import { first } from "@/lib/email-query";
import { reasonLabel } from "@/lib/labels";
import { p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { IdChip } from "@/components/ui/code";
import { CursorPagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { SearchForm } from "@/components/search-form";
import { AddSuppressionButton, SuppressionMenu } from "@/components/suppressions/suppression-controls";

export const metadata = { title: "Suppressions" };

export default async function SuppressionsPage({ params, searchParams }: SlugParams & SearchParamsProp) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const q = first(sp.q);
  const cursor = first(sp.cursor);
  const list = await mailerCall((m) => m.listSuppressions({ limit: 100, ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) }));
  const base = p(slug, "suppressions");
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...extra });
    return u.toString() ? `${base}?${u}` : base;
  };

  return (
    <>
      <PageHeader
        title="Suppressions"
        description="Addresses Flaresend will not send to. This list is shared by every project. Cloudflare Email Service keeps its own list too, which you manage in the Cloudflare dashboard."
        actions={<AddSuppressionButton slug={slug} />}
      />
      <SearchForm q={q} placeholder="Search addresses" />
      {!list.ok ? (
        <PageError error={list.error} title="Could not load suppressions" />
      ) : list.data.data.length === 0 ? (
        q || cursor ? (
          <EmptyState
            icon={<SearchX />}
            title={q ? "No addresses match" : "No more addresses"}
            action={
              <LinkButton href={base} variant="secondary">
                {q ? "Clear search" : "Back to the first page"}
              </LinkButton>
            }
          />
        ) : (
          <EmptyState icon={<Ban />} title="No suppressed addresses" action={<AddSuppressionButton slug={slug} />}>
            Hard bounces and spam complaints are added here automatically.
          </EmptyState>
        )
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Address</TH>
                <TH className="w-[130px]">Reason</TH>
                <TH className="hidden w-[190px] md:table-cell">Source</TH>
                <TH className="w-[110px]">Added</TH>
                <TH className="w-[52px]">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {list.data.data.map((s) => (
                <tr key={s.address} className="transition-colors hover:bg-background-hover">
                  <TD className="truncate font-mono text-xs">{s.address}</TD>
                  <TD className="text-foreground-muted">{reasonLabel(s.reason)}</TD>
                  <TD className="hidden md:table-cell">
                    {s.sourceEmailId ? <IdChip value={s.sourceEmailId} href={`/emails/${encodeURIComponent(s.sourceEmailId)}`} className="-ml-1.5" /> : <span className="text-foreground-subtle">—</span>}
                  </TD>
                  <TD className="text-foreground-muted">
                    <Time iso={s.createdAt} />
                  </TD>
                  <TD className="text-right">
                    <SuppressionMenu slug={slug} address={s.address} />
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
          <CursorPagination
            count={list.data.data.length}
            hrefPrev={cursor ? qs({}) : null}
            hrefNext={list.data.nextCursor ? qs({ cursor: list.data.nextCursor }) : null}
          />
        </>
      )}
    </>
  );
}

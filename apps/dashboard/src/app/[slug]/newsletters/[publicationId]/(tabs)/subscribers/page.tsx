import { Users } from "lucide-react";
import type { NewsletterFilter } from "@flaresend/types";
import { mailerCall } from "@/lib/mailer";
import { Input } from "@/components/ui/input";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { FilterSelect } from "@/components/newsletters/filter-select";
import { SubscriberActions } from "@/components/newsletters/subscribers";
import { num } from "@/lib/format";

export const metadata = { title: "Subscribers" };

const ALL = "all";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; publicationId: string }>;
  searchParams: Promise<{ cursor?: string; q?: string; status?: string; tag?: string; source?: string }>;
}) {
  const { slug, publicationId: id } = await params;
  const q = await searchParams;
  const filter: NewsletterFilter = {
    ...(q.q ? { q: q.q } : {}),
    ...(["pending", "subscribed", "unsubscribed"].includes(q.status ?? "") ? { status: q.status as NewsletterFilter["status"] } : {}),
    ...(q.tag && q.tag !== ALL ? { tags: [q.tag] } : {}),
    ...(q.source && q.source !== ALL ? { sources: [q.source] } : {}),
  };
  const r = await mailerCall(async (m) => {
    const [page, tags, audiences, pub, reports] = await Promise.all([
      m.listNewsletterSubscribers(slug, id, { cursor: q.cursor, filter, limit: 50 }),
      m.listNewsletterTags(slug, id),
      m.listAudiences(slug),
      m.getPublication(slug, id),
      m.newsletterReports(slug, id),
    ]);
    return { page, tags, audiences, pub, reports };
  });
  if (!r.ok) return <PageError error={r.error} title="Could not load subscribers" />;
  const { page, tags, audiences, pub, reports } = r.data;
  const base = `/${slug}/newsletters/${id}/subscribers`;
  const filtered = Object.keys(filter).length > 0;
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const signupUrl = pub.siteEnabled && pub.formEnabled ? `${pub.publicUrl}/subscribe` : null;
  const sources = reports.sources.map((s) => s.source);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex flex-wrap items-center gap-2" role="search">
          <Input name="q" defaultValue={q.q} type="search" placeholder="Find an email or name" aria-label="Find an email or name" className="w-56" />
          <FilterSelect
            name="status"
            ariaLabel="Status"
            defaultValue={filter.status ?? ALL}
            className="w-40"
            options={[
              { value: ALL, label: "Any status" },
              { value: "subscribed", label: "Subscribed" },
              { value: "pending", label: "Waiting to confirm" },
              { value: "unsubscribed", label: "Unsubscribed" },
            ]}
          />
          {tags.length ? (
            <FilterSelect
              name="tag"
              ariaLabel="Tag"
              defaultValue={q.tag || ALL}
              className="w-36"
              options={[{ value: ALL, label: "Any tag" }, ...tags.map((t) => ({ value: t.id, label: t.name }))]}
            />
          ) : null}
          {sources.length > 1 ? (
            <FilterSelect
              name="source"
              ariaLabel="Source"
              defaultValue={q.source || ALL}
              className="w-40"
              options={[{ value: ALL, label: "Any source" }, ...sources.map((s) => ({ value: s, label: s }))]}
            />
          ) : null}
          <button type="submit" className="sr-only">Filter</button>
          {filtered ? (
            <LinkButton href={base} variant="ghost" size="sm">
              Clear
            </LinkButton>
          ) : null}
        </form>
        <SubscriberActions slug={slug} id={id} filter={filter} tags={tags} audiences={audiences} signupUrl={signupUrl} />
      </div>

      <p className="text-xs text-foreground-muted">
        <span className="font-semibold text-foreground tabular-nums">{num(reports.active)}</span> subscribed · {num(reports.pending)} waiting to confirm ·{" "}
        {num(reports.unsubscribed)} unsubscribed
      </p>

      {page.data.length ? (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Subscriber</TH>
                <TH className="w-44">Status</TH>
                <TH className="w-48">Tags</TH>
                <TH className="w-40">Source</TH>
                <TH className="w-28">Joined</TH>
              </tr>
            </THead>
            <TBody>
              {page.data.map((s) => (
                <TR key={s.id} href={`${base}/${s.id}`} label={`Open ${s.email}`}>
                  <TD>
                    <span className="block truncate font-medium">{s.email}</span>
                    {s.firstName || s.lastName ? (
                      <span className="block truncate text-xs text-foreground-muted">{[s.firstName, s.lastName].filter(Boolean).join(" ")}</span>
                    ) : null}
                  </TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={s.status} label={s.status === "pending" ? "Waiting to confirm" : undefined} />
                      {s.blocked ? <Badge tone="danger">Suppressed</Badge> : null}
                    </span>
                  </TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      {s.tags.length ? s.tags.map((t) => <Badge key={t}>{tagName.get(t) ?? t}</Badge>) : <span className="text-foreground-subtle">—</span>}
                    </span>
                  </TD>
                  <TD className="truncate text-foreground-muted">{s.source}</TD>
                  <TD className="text-foreground-muted">
                    <Time iso={s.createdAt} format="date" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {page.nextCursor ? (
            <LinkButton
              className="w-fit"
              href={`${base}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([k, v]) => k !== "cursor" && v)), cursor: page.nextCursor })}`}
            >
              Next page
            </LinkButton>
          ) : null}
        </>
      ) : filtered ? (
        <EmptyState icon={<Users />} title="Nobody matches these filters" action={<LinkButton href={base}>Clear filters</LinkButton>} />
      ) : (
        <EmptyState
          icon={<Users />}
          title="No subscribers yet"
          action={<LinkButton href={`${base}?import=1`} variant="primary">Import subscribers</LinkButton>}
        >
          {signupUrl
            ? "Share the sign-up link, or import people who already agreed to receive this newsletter."
            : "Turn on the sign-up form on the Website tab, or import people who already agreed to receive this newsletter."}
        </EmptyState>
      )}
    </div>
  );
}

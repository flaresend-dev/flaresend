import { ArrowUpRight, Mail, PenLine } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/newsletters/filter-select";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { RunLive } from "@/components/newsletters/report";
import { num } from "@/lib/format";

export const metadata = { title: "Post report" };

const STATUS_FILTER = [
  { value: "all", label: "All statuses" },
  { value: "delivered", label: "Delivered" },
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicked" },
  { value: "bounced", label: "Bounced" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
  { value: "pending", label: "Waiting" },
];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; publicationId: string; postId: string }>;
  searchParams: Promise<{ q?: string; status?: string; cursor?: string }>;
}) {
  const { slug, publicationId, postId } = await params;
  const q = await searchParams;
  const base = `/${slug}/newsletters/${publicationId}`;
  const r = await mailerCall(async (m) => {
    const [post, runs] = await Promise.all([
      m.getNewsletterPost(slug, publicationId, postId),
      m.listNewsletterEmailRuns(slug, publicationId, { postId, limit: 1 }),
    ]);
    const latest = runs.data[0];
    const [run, recipients] = latest
      ? await Promise.all([
          m.getNewsletterEmailRun(slug, publicationId, latest.id),
          m.listNewsletterRunRecipients(slug, publicationId, latest.id, {
            q: q.q || undefined,
            status: q.status && q.status !== "all" ? q.status : undefined,
            cursor: q.cursor,
            limit: 50,
          }),
        ])
      : [null, null];
    return { post, run, recipients };
  });
  if (!r.ok)
    return (
      <>
        <PageHeader title="Post report" back={{ href: `${base}/posts`, label: "Posts" }} />
        <PageError error={r.error} />
      </>
    );
  const { post, run, recipients } = r.data;
  const webStatus = post.archivedAt ? "archived" : post.webStatus;
  return (
    <>
      <PageHeader
        back={{ href: `${base}/posts`, label: "Posts" }}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="min-w-0">{post.title || "Untitled post"}</span>
            {post.publicRevisionId || post.webStatus === "scheduled" ? <StatusBadge status={webStatus} label={webStatus === "published" ? "On the website" : undefined} /> : null}
            {run ? <StatusBadge status={run.status} label={run.status === "sent" ? "Emailed" : undefined} /> : null}
          </span>
        }
        actions={
          <>
            {post.publicRevisionId ? (
              <a
                href={post.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-background-elevated px-3 text-sm font-medium shadow-card hover:bg-background-hover"
              >
                <ArrowUpRight className="size-4" /> View on website
              </a>
            ) : null}
            <LinkButton href={`${base}/posts/${postId}`}>
              <PenLine /> Edit post
            </LinkButton>
          </>
        }
      />
      {!run ? (
        <EmptyState
          icon={<Mail />}
          title="This post is on the website only"
          action={
            <LinkButton href={`${base}/posts/${postId}/review`} variant="primary">
              Send by email
            </LinkButton>
          }
        >
          Send it to your subscribers to see delivery, opens and clicks here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          <RunLive slug={slug} initial={run} />
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="min-w-0">
              <form className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-section font-semibold">Recipients</h2>
                <div className="flex flex-wrap gap-2">
                  <Input name="q" defaultValue={q.q} placeholder="Find an address" aria-label="Find an address" className="w-48" />
                  <FilterSelect name="status" defaultValue={q.status || "all"} options={STATUS_FILTER} ariaLabel="Status" className="w-36" />
                  <button type="submit" className="sr-only">Filter</button>
                </div>
              </form>
              {recipients?.data.length ? (
                <Table>
                  <THead>
                    <tr>
                      <TH>Subscriber</TH>
                      <TH className="w-32">Status</TH>
                      <TH className="w-28">Opened</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {recipients.data.map((x) => (
                      <TR key={x.id} href={x.emailId ? `/${slug}/emails/${x.emailId}` : undefined} label={x.emailId ? `Open the email to ${x.email}` : undefined}>
                        <TD className="truncate font-medium">{x.email}</TD>
                        <TD>
                          <StatusBadge status={x.clickedAt ? "clicked" : x.status} label={x.status === "pending" ? "Waiting" : undefined} />
                        </TD>
                        <TD className="text-foreground-muted">
                          <Time iso={x.openedAt} format="clock" />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-foreground-muted">
                  {q.q || (q.status && q.status !== "all") ? "No recipient matches this filter." : "Nobody has been reached yet."}
                </p>
              )}
              {recipients?.nextCursor ? (
                <LinkButton
                  className="mt-3"
                  href={`${base}/posts/${postId}/report?${new URLSearchParams({ cursor: recipients.nextCursor, ...(q.q ? { q: q.q } : {}), ...(q.status ? { status: q.status } : {}) })}`}
                >
                  Next page
                </LinkButton>
              ) : null}
            </section>
            <section className="min-w-0">
              <h2 className="mb-2.5 text-section font-semibold">Links clicked</h2>
              {run.links.length ? (
                <Table fixed>
                  <THead>
                    <tr>
                      <TH>Link</TH>
                      <TH className="w-20 text-right">Clicks</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {run.links.map((l) => (
                      <TR key={l.url}>
                        <TD className="truncate font-mono text-xs" title={l.url}>
                          {l.url.replace(/^https?:\/\//, "")}
                        </TD>
                        <TD className="text-right tabular-nums">{num(l.clicks)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-foreground-muted">No clicks yet.</p>
              )}
              <p className="mt-2.5 text-xs text-foreground-muted">
                Opens are an estimate. Mail apps that block or pre-load images change the count.
              </p>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

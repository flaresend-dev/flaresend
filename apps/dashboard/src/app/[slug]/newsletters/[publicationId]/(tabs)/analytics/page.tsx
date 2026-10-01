import { mailerCall } from "@/lib/mailer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedLinks } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageError } from "@/components/page-error";
import { SubscriberChart, type SubscriberPoint } from "@/components/newsletters/subscriber-chart";
import { num, pct, ratio } from "@/lib/format";

export const metadata = { title: "Newsletter analytics" };

const RANGES = [7, 30, 90] as const;

/** Daily totals for the range: walk back from today's total using each day's joins and leaves. */
function series(active: number, days: Array<{ date: string; subscribed: number; unsubscribed: number }>, range: number, zone: string): SubscriberPoint[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const out: SubscriberPoint[] = [];
  let total = active;
  for (let i = 0; i < range; i++) {
    const date = fmt.format(new Date(Date.now() - i * 86_400_000));
    const d = byDate.get(date);
    out.push({ date, total, joined: d?.subscribed ?? 0, left: d?.unsubscribed ?? 0 });
    total = Math.max(0, total - (d?.subscribed ?? 0) + (d?.unsubscribed ?? 0));
  }
  return out.reverse();
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; publicationId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug, publicationId: id } = await params;
  const q = await searchParams;
  const range = RANGES.find((r) => String(r) === q.range) ?? 30;
  const since = new Date(Date.now() - range * 86_400_000).toISOString();
  const r = await mailerCall(async (m) => {
    const [pub, reports, runs, posts] = await Promise.all([
      m.getPublication(slug, id),
      m.newsletterReports(slug, id, { since }),
      m.listNewsletterEmailRuns(slug, id, { limit: 20 }),
      m.listNewsletterPosts(slug, id, { limit: 100 }),
    ]);
    return { pub, reports, runs: runs.data, titles: new Map(posts.data.map((p) => [p.id, p.title])) };
  });
  if (!r.ok) return <PageError error={r.error} title="Could not load analytics" />;
  const { pub, reports, runs, titles } = r.data;
  const base = `/${slug}/newsletters/${id}`;
  const data = series(reports.active, reports.days, range, pub.timezone);
  const sent = runs.filter((x) => x.status !== "canceled" && x.status !== "scheduled");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedLinks
          ariaLabel="Date range"
          value={String(range)}
          options={RANGES.map((n) => ({ value: String(n), label: `${n} days`, href: `${base}/analytics?range=${n}` }))}
        />
        <span className="text-xs text-foreground-muted">Days follow the newsletter&apos;s timezone, {pub.timezone.replace(/_/g, " ")}.</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subscribers</CardTitle>
          <CardDescription className="tabular-nums">
            {num(reports.active)} now · +{num(reports.newSubscriptions)} joined · {num(reports.unsubscribeCount)} left
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubscriberChart data={data} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="min-w-0">
          <h2 className="mb-2.5 text-section font-semibold">Emails sent</h2>
          {sent.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Post</TH>
                  <TH className="w-24 text-right">Delivered</TH>
                  <TH className="w-20 text-right">Opened</TH>
                  <TH className="w-20 text-right">Clicked</TH>
                </tr>
              </THead>
              <TBody>
                {sent.map((x) => (
                  <TR key={x.id} href={`${base}/posts/${x.postId}/report`} label={`Report for ${titles.get(x.postId) || x.subject}`}>
                    <TD className="truncate font-medium">{titles.get(x.postId) || x.subject}</TD>
                    <TD className="text-right tabular-nums">{num(x.delivered)}</TD>
                    <TD className="text-right tabular-nums">{x.delivered ? pct(ratio(x.opened, x.delivered), 0) : "—"}</TD>
                    <TD className="text-right tabular-nums">{x.delivered ? pct(ratio(x.clicked, x.delivered), 0) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-foreground-muted">No emails sent yet.</p>
          )}
          {sent.length ? <p className="mt-2 text-xs text-foreground-muted">Rates use delivered emails. Opens are an estimate.</p> : null}
        </section>
        <section className="min-w-0">
          <h2 className="mb-2.5 text-section font-semibold">Where subscribers came from</h2>
          {reports.sources.length ? (
            <Table fixed={false}>
              <TBody>
                {reports.sources.map((s) => (
                  <TR key={s.source}>
                    <TD className="truncate">{s.source.replace(/_/g, " ")}</TD>
                    <TD className="w-20 text-right tabular-nums">{num(s.count)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-foreground-muted">No subscribers yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

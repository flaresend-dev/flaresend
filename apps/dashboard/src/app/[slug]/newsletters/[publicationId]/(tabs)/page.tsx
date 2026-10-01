import Link from "next/link";
import { ArrowRight, Check, PenLine } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { num, pct, ratio } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { PostTable } from "@/components/newsletters/post-table";
import { PostCreate } from "@/components/newsletters/post-create";
import { cn } from "@/lib/utils";

export const metadata = { title: "Newsletter" };

export default async function Page({ params }: { params: Promise<{ slug: string; publicationId: string }> }) {
  const { slug, publicationId: id } = await params;
  const r = await mailerCall(async (m) => {
    const [pub, caps, recent, drafts, runs, reports] = await Promise.all([
      m.getPublication(slug, id),
      m.newsletterCapabilities(slug, id),
      m.listNewsletterPosts(slug, id, { limit: 5 }),
      m.listNewsletterPosts(slug, id, { limit: 1, state: "draft" }),
      m.listNewsletterEmailRuns(slug, id, { limit: 5 }),
      m.newsletterReports(slug, id),
    ]);
    return { pub, caps, recent: recent.data, draft: drafts.data[0], runs: runs.data, reports };
  });
  if (!r.ok) return <PageError error={r.error} />;
  const { pub, caps, recent, draft, runs, reports } = r.data;
  const base = `/${slug}/newsletters/${id}`;
  const lastSent = runs.find((x) => x.status === "sent" || x.status === "sending");
  const latestPublished = recent.find((p) => p.publishedAt)?.publishedAt;

  const steps: Array<{ done: boolean; label: string; reason: string; href: string; action: string }> = [
    { done: true, label: "Name and look", reason: "", href: `${base}/settings`, action: "" },
    {
      done: caps.emailBlocker !== "sender_missing" && caps.emailBlocker !== "sender_unverified",
      label: "Verify a sender address",
      reason: "needed to send email and confirmation links",
      href: `${base}/settings#sender`,
      action: "Set up sender",
    },
    {
      done: pub.siteEnabled && pub.formEnabled,
      label: "Turn on the website and sign-up form",
      reason: "readers subscribe there",
      href: `${base}/website`,
      action: "Open website settings",
    },
    {
      done: pub.subscriberCount > 0,
      label: "Get your first subscribers",
      reason: "share the sign-up form or import a list",
      href: `${base}/subscribers`,
      action: "Add subscribers",
    },
    {
      done: !!pub.postalAddress.trim(),
      label: "Add a postal address",
      reason: "shown in the footer of every email",
      href: `${base}/settings#sender`,
      action: "Add address",
    },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-6">
      {done < steps.length ? (
        <Card>
          <CardHeader
            actions={
              <div
                className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-background-hover"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={steps.length}
                aria-valuenow={done}
                aria-label="Setup progress"
              >
                <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
              </div>
            }
          >
            <CardTitle>Finish setting up</CardTitle>
            <CardDescription>
              {done} of {steps.length} done
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {steps.map((s) => (
                <li key={s.label} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]",
                      s.done ? "border-success-fg bg-success-fg text-background-elevated" : "border-border-strong",
                    )}
                    aria-hidden
                  >
                    {s.done ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className={cn("min-w-0 flex-1 text-sm", s.done && "text-foreground-muted")}>
                    <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
                    <span className={s.done ? "" : "font-medium"}>{s.label}</span>
                    {!s.done && s.reason ? <span className="text-foreground-muted"> · {s.reason}</span> : null}
                  </span>
                  {!s.done ? (
                    <LinkButton href={s.href} size="sm">
                      {s.action}
                    </LinkButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Subscribers" value={num(pub.subscriberCount)} sub={`+${num(reports.newSubscriptions)} in the last 30 days`} />
        <Stat
          label="Last email opened by"
          value={lastSent && lastSent.delivered ? pct(ratio(lastSent.opened, lastSent.delivered), 0) : "—"}
          sub={lastSent ? (lastSent.delivered ? `${num(lastSent.opened)} of ${num(lastSent.delivered)} delivered · estimate` : "Waiting for delivery") : "No email sent yet"}
        />
        <Stat
          label="Posts published"
          value={num(reports.published)}
          sub={latestPublished ? <>Latest <Time iso={latestPublished} format="date" /></> : "None yet"}
        />
      </div>

      {draft ? (
        <Card className="flex flex-wrap items-center gap-4 px-5 py-3.5">
          <PenLine className="size-5 shrink-0 text-foreground-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground-muted">Continue writing</p>
            <p className="truncate font-semibold">{draft.title || "Untitled post"}</p>
          </div>
          <span className="text-xs text-foreground-muted">
            Edited <Time iso={draft.updatedAt} />
          </span>
          <LinkButton href={`${base}/posts/${draft.id}`}>Open draft</LinkButton>
        </Card>
      ) : null}

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-section font-semibold">Recent posts</h2>
          {recent.length ? (
            <Link href={`${base}/posts`} className="inline-flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground">
              All posts <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
        {recent.length ? (
          <PostTable slug={slug} base={base} posts={recent} menu={false} />
        ) : (
          <EmptyState
            icon={<PenLine />}
            title="Write your first post"
            action={<PostCreate slug={slug} id={id} label="Write a post" disabled={pub.status === "archived"} />}
          >
            Draft it yourself or let AI write a first version. Then publish it on the website, send it by email, or both.
          </EmptyState>
        )}
      </section>
    </div>
  );
}

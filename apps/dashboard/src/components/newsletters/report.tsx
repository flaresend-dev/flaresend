"use client";
// The post report: live progress while an email goes out, then delivery, opens, clicks and unsubscribes.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NewsletterRunDetail } from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/badge";
import { Time } from "@/components/ui/time";
import { num, pct, ratio } from "@/lib/format";

const POLL_MS = 3_000;

export function RunLive({ slug, initial }: { slug: string; initial: NewsletterRunDetail }) {
  const router = useRouter();
  const [run, setRun] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setRun(initial), [initial]);
  const live = run.status === "scheduled" || run.status === "sending";

  useEffect(() => {
    if (!live && run.delivered + run.bounced + run.failed >= run.processed - run.skipped) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          `/api/newsletter-run/${encodeURIComponent(slug)}/${encodeURIComponent(run.publicationId)}/${encodeURIComponent(run.id)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const next = (await res.json()) as NewsletterRunDetail;
        setRun(next);
        if (next.status !== run.status) router.refresh();
      } catch {
        /* try again next tick */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [live, run.status, run.id, run.publicationId, run.delivered, run.bounced, run.failed, run.processed, run.skipped, slug, router]);

  const sent = Math.max(0, run.processed - run.skipped);
  const base = run.delivered;
  return (
    <div className="flex flex-col gap-5">
      {live ? (
        <Card className="px-5 py-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {run.status === "scheduled" ? (
                <>
                  <span className="font-semibold">Scheduled for {num(run.total)} subscribers</span>{" "}
                  <span className="text-foreground-muted">
                    · <Time iso={run.scheduledAt} format="absolute" />
                    {run.scheduleTimezone ? ` (shown in your time; scheduled in ${run.scheduleTimezone})` : ""}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Sending to {num(run.total)} subscribers</span>{" "}
                  <span className="text-foreground-muted">
                    · started <Time iso={run.startedAt} />
                  </span>
                </>
              )}
            </p>
            <div className="flex items-center gap-3">
              {run.status === "sending" ? (
                <span className="text-sm text-foreground-muted tabular-nums">
                  {num(run.processed)} of {num(run.total)}
                </span>
              ) : null}
              <Button size="sm" onClick={() => setConfirm(true)}>
                {run.status === "scheduled" ? "Cancel schedule" : "Stop sending"}
              </Button>
            </div>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-background-hover"
            role="progressbar"
            aria-label="Sending progress"
            aria-valuemin={0}
            aria-valuemax={run.total}
            aria-valuenow={run.processed}
          >
            <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${run.total ? (run.processed / run.total) * 100 : 0}%` }} />
          </div>
          {run.waiting === "daily_limit" ? (
            <p className="mt-2.5 text-xs text-warning-fg">Paused by this project&apos;s daily limit. It continues after 00:00 UTC.</p>
          ) : null}
        </Card>
      ) : run.status === "canceled" ? (
        <Notice tone="muted">
          This email was canceled. {num(sent)} of {num(run.total)} were handed over before it stopped.
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Delivered" value={num(run.delivered)} sub={sent ? `${pct(ratio(run.delivered, sent))} of ${num(sent)} sent` : "Nothing sent yet"} />
        <Stat label="Opened" value={num(run.opened)} sub={base ? `${pct(ratio(run.opened, base))} · estimate` : "—"} />
        <Stat label="Clicked" value={num(run.clicked)} sub={base ? `${pct(ratio(run.clicked, base))} of delivered` : "—"} />
        <Stat label="Bounced or failed" value={num(run.bounced + run.failed)} sub={`${num(run.bounced)} bounced · ${num(run.failed)} failed`} tone={run.bounced + run.failed ? "danger" : undefined} />
        <Stat label="Unsubscribed" value={num(run.unsubscribed)} sub="from this email" />
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={run.status === "scheduled" ? "Cancel this scheduled email?" : "Stop sending?"}
        body={
          run.status === "scheduled"
            ? "Nobody receives it. The post stays as it is."
            : "Subscribers who have not been reached yet will not get it. Emails already handed over still arrive."
        }
        confirmLabel={run.status === "scheduled" ? "Cancel schedule" : "Stop sending"}
        tone="danger"
        onConfirm={async () => {
          const r = await newsletterAction(slug, "cancelNewsletterEmailRun", run.publicationId, run.id);
          if (!r.ok) return { error: r.error.message };
          setRun({ ...run, ...r.data });
          router.refresh();
          return { ok: true, message: run.status === "scheduled" ? "Schedule canceled." : "Sending stopped." };
        }}
      />
    </div>
  );
}

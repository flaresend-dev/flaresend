"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BroadcastRecord } from "@flaresend/types";
import { BROADCAST_COUNT_KEYS, statusLabel } from "@/lib/labels";
import { num } from "@/lib/format";
import { Stat } from "@/components/ui/stat";
import { Progress } from "./progress";

const POLL_MS = 5_000;
const DONE = new Set(["sent", "canceled", "draft"]);

/** Stat tiles + progress. While the broadcast is scheduled or sending, polls /api/broadcast/{slug}/{id}. */
export function BroadcastLive({ slug, initial }: { slug: string; initial: BroadcastRecord }) {
  const router = useRouter();
  const [b, setB] = useState(initial);

  useEffect(() => setB(initial), [initial]);
  useEffect(() => {
    if (DONE.has(b.status)) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/broadcast/${encodeURIComponent(slug)}/${encodeURIComponent(b.id)}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as BroadcastRecord;
        setB(next);
        // Refresh the server parts (header status, times) once it finishes.
        if (DONE.has(next.status)) router.refresh();
      } catch {
        /* try again next tick */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [b.status, b.id, slug, router]);

  const counts = b.counts ?? {};
  const value = (k: (typeof BROADCAST_COUNT_KEYS)[number]) => (k === "sent" ? b.sent : (counts[k] ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {BROADCAST_COUNT_KEYS.map((k) => (
          <Stat key={k} label={statusLabel(k)} value={num(value(k))} />
        ))}
      </div>
      {b.status === "sending" || b.status === "scheduled" ? (
        <div className="flex flex-col gap-1.5">
          <Progress sent={b.sent} total={b.total} className="max-w-none" />
          <p className="text-xs text-foreground-muted">
            {b.status === "sending" ? "Sending. This updates every 5 seconds." : "Waiting for the scheduled time."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

import type { EmailEventRecord } from "@flaresend/types";
import { statusDisplay } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/components/ui/badge";
import { Time } from "@/components/ui/time";
import { EventData } from "@/components/event-data";

/** Newest first, vertical line, dot in the tone colour, a Details disclosure per event. */
export function EventTimeline({ events, showRecipient }: { events: EmailEventRecord[]; showRecipient: boolean }) {
  const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!sorted.length) return <p className="text-sm text-foreground-muted">No events yet.</p>;
  return (
    <ol className="relative flex flex-col">
      {sorted.map((ev, i) => {
        const d = statusDisplay(ev.type);
        const hasData = ev.data !== null && ev.data !== undefined && (typeof ev.data !== "object" || Object.keys(ev.data as object).length > 0);
        return (
          <li key={ev.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < sorted.length - 1 ? <span className="absolute top-4 bottom-0 left-[4.5px] w-px bg-border" aria-hidden /> : null}
            <span className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-current bg-background-elevated", TONE_TEXT[d.tone])} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{d.label}</span>
                <Time iso={ev.createdAt} format="clock" className="text-xs text-foreground-muted" />
              </div>
              {showRecipient && ev.recipient ? <span className="truncate font-mono text-xs text-foreground-muted">{ev.recipient}</span> : null}
              {hasData ? (
                <details className="group mt-1">
                  <summary className="w-fit cursor-pointer list-none text-xs text-foreground-subtle transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Details</span>
                    <span className="hidden group-open:inline">Hide details</span>
                  </summary>
                  <div className="mt-1.5 rounded-md border border-border bg-background-subtle p-2.5">
                    <EventData data={ev.data} />
                  </div>
                </details>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

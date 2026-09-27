"use client";

import { useEffect, useState } from "react";
import { age, formatAbsolute, formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

/**
 * Every timestamp in the app goes through this.
 * - `relative` (default): "3m ago", updated every 30 s.
 * - `absolute`: "Sep 25, 2026, 2:03 PM" in the viewer's time zone.
 * - `date`: "Sep 25, 2026". `clock`: "2:03:14 PM".
 * The tooltip shows the full local time and UTC. The server render uses UTC; the client re-renders in local time
 * after it mounts.
 */
export function Time({ iso, format = "relative", className, fallback = "—" }: {
  iso: string | null | undefined;
  format?: "relative" | "absolute" | "date" | "clock";
  className?: string;
  fallback?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (format !== "relative") return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [format]);

  if (!iso) return <span className={cn("text-foreground-subtle", className)}>{fallback}</span>;
  const tz = now === null ? "UTC" : undefined;
  const text =
    format === "relative"
      ? age(iso, now ?? Date.now())
      : format === "date"
        ? formatAbsolute(iso, { timeZone: tz, dateOnly: true })
        : format === "clock"
          ? formatClock(iso, { timeZone: tz })
          : formatAbsolute(iso, { timeZone: tz });

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-0.5 tabular-nums">
          <span>{formatAbsolute(iso, { seconds: true })}</span>
          <span className="text-foreground-muted">{formatAbsolute(iso, { seconds: true, timeZone: "UTC" })} UTC</span>
        </span>
      }
    >
      <time dateTime={iso} suppressHydrationWarning className={cn("whitespace-nowrap tabular-nums", className)}>
        {text}
      </time>
    </Tooltip>
  );
}

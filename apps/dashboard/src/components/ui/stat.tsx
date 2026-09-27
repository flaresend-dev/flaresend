import * as React from "react";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "./badge";

/** Stat tile: label, big number, optional sub line. */
export function Stat({ label, value, sub, tone, className }: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-background-elevated px-4 py-3 shadow-card", className)}>
      <span className="truncate text-xs font-medium text-foreground-muted">{label}</span>
      <span className={cn("text-stat font-semibold tabular-nums", tone ? TONE_TEXT[tone] : "text-foreground")}>{value}</span>
      {sub !== undefined ? <span className="truncate text-xs text-foreground-muted tabular-nums">{sub}</span> : null}
    </div>
  );
}

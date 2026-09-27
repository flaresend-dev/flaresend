"use client";

import * as React from "react";
import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

const listClass = "flex items-end gap-4 overflow-x-auto border-b border-border";
const triggerClass =
  "-mb-px inline-flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-0.5 text-sm font-medium text-foreground-muted " +
  "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground";
const activeClass = "border-foreground text-foreground";

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(listClass, className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn(triggerClass, "data-[state=active]:border-foreground data-[state=active]:text-foreground", className)} {...props} />;
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}

/** Tabs that are plain links, for URL-driven views. */
export function LinkTabs({ tabs, active, className }: { tabs: Array<{ id: string; label: React.ReactNode; href: string }>; active: string; className?: string }) {
  return (
    <nav className={cn(listClass, className)} aria-label="Tabs">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined} className={cn(triggerClass, t.id === active && activeClass)}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Small two-or-three-option toggle ("Day | Hour", "Draft | Saved", "Original | As sent"). */
export function Segmented<T extends string>({ options, value, onChange, className, ariaLabel }: {
  options: Array<{ value: T; label: React.ReactNode; disabled?: boolean }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-background-subtle p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-[5px] px-2.5 text-xs font-medium transition-colors disabled:opacity-40",
            value === o.value ? "bg-background-elevated text-foreground shadow-card ring-1 ring-border" : "text-foreground-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Same look as Segmented, but each option is a link (URL-driven controls on server pages). */
export function SegmentedLinks({ options, value, className, ariaLabel }: {
  options: Array<{ value: string; label: React.ReactNode; href: string }>;
  value: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-background-subtle p-0.5", className)}>
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.href}
          aria-current={value === o.value ? "true" : undefined}
          className={cn(
            "flex h-full items-center rounded-[5px] px-2.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-background-elevated text-foreground shadow-card ring-1 ring-border" : "text-foreground-muted hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("fs-skeleton rounded-md", className)} aria-hidden {...props} />;
}

/** Loading state for a list page: header, optional filter bar, table rows. */
export function PageSkeleton({ rows = 8, columns = 4, filters = true }: { rows?: number; columns?: number; filters?: boolean }) {
  return (
    <div aria-busy aria-label="Loading">
      <div className="mb-6 flex min-h-9 items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>
      {filters ? (
        <div className="mb-4 flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      ) : null}
      <TableSkeleton rows={rows} columns={columns} />
    </div>
  );
}

/** Detail pages: back link, title, main panel + side column. */
export function DetailSkeleton() {
  return (
    <div aria-busy aria-label="Loading">
      <Skeleton className="mb-3 h-3 w-16" />
      <div className="mb-6 flex min-h-9 items-center justify-between">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[560px] rounded-lg" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Metrics: six tiles, a chart, three cards. */
export function MetricsSkeleton() {
  return (
    <div aria-busy aria-label="Loading">
      <div className="mb-6 flex min-h-9 items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="mb-6 h-[400px] rounded-lg" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    </div>
  );
}

/** Settings-style stacked cards. */
export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-busy aria-label="Loading" className="max-w-3xl">
      <div className="mb-6 flex min-h-9 items-center">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex flex-col gap-6">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background-elevated">
      <div className="flex h-9 items-center gap-6 border-b border-border bg-background-subtle px-4">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-11 items-center gap-6 border-b border-border px-4 last:border-b-0">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className={cn("h-3.5 flex-1", i === 0 && "max-w-56")} />
          ))}
        </div>
      ))}
    </div>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "./button";
import { cn } from "@/lib/utils";

/**
 * "Showing N" + ← → buttons. The mailer pages with an opaque cursor that only goes forward, so ← is "first page"
 * (shown when a cursor is set) and → follows `nextCursor`.
 */
export function CursorPagination({ count, hrefPrev, hrefNext, className }: {
  count: number;
  /** Set when not on the first page. */
  hrefPrev?: string | null;
  hrefNext?: string | null;
  className?: string;
}) {
  const btn = buttonVariants({ variant: "secondary", size: "icon-sm" });
  const off = cn(btn, "pointer-events-none opacity-40");
  return (
    <div className={cn("flex items-center justify-between gap-3 pt-3 text-xs text-foreground-muted", className)}>
      <span className="tabular-nums">Showing {count.toLocaleString("en-US")}</span>
      <div className="flex items-center gap-1.5">
        {hrefPrev ? (
          <Link href={hrefPrev} className={btn} aria-label="First page" title="First page">
            <ChevronLeft />
          </Link>
        ) : (
          <span className={off} aria-hidden>
            <ChevronLeft />
          </span>
        )}
        {hrefNext ? (
          <Link href={hrefNext} className={btn} aria-label="Next page" title="Next page">
            <ChevronRight />
          </Link>
        ) : (
          <span className={off} aria-hidden>
            <ChevronRight />
          </span>
        )}
      </div>
    </div>
  );
}

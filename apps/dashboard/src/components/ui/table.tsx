import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Bordered, fixed-layout table. Give columns widths with `<TH className="w-40">` so rows do not reflow between pages. */
export function Table({ className, wrapperClassName, fixed = true, ...props }: React.TableHTMLAttributes<HTMLTableElement> & {
  wrapperClassName?: string;
  fixed?: boolean;
}) {
  return (
    <div className={cn("fs-scroll-x relative rounded-lg border border-border bg-background-elevated shadow-card", wrapperClassName)}>
      <table className={cn("w-full min-w-[600px] border-collapse text-sm", fixed && "table-fixed", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-background-subtle", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&>tr:last-child>td]:border-b-0", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-9 border-b border-border px-4 text-left align-middle text-xs font-medium whitespace-nowrap text-foreground-muted first:rounded-tl-lg last:rounded-tr-lg",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-11 border-b border-border px-4 py-2 align-middle", className)} {...props} />;
}

/**
 * A row. With `href` the whole row is a link: an absolutely positioned <a> is added to the first cell and covers
 * the row. Links and buttons inside cells stay clickable when wrapped in `CellAction` (relative z-10).
 */
export function TR({ href, label, className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { href?: string; label?: string }) {
  if (!href) {
    return (
      <tr className={cn("transition-colors duration-150", className)} {...props}>
        {children}
      </tr>
    );
  }
  const cells = React.Children.toArray(children);
  const firstCell = cells[0];
  const overlay = (
    <Link
      href={href}
      aria-label={label}
      className="absolute inset-0 z-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    />
  );
  return (
    <tr className={cn("relative cursor-pointer transition-colors duration-150 hover:bg-background-hover", className)} {...props}>
      {React.isValidElement<{ children?: React.ReactNode }>(firstCell)
        ? React.cloneElement(firstCell, undefined, <>{overlay}{firstCell.props.children}</>)
        : firstCell}
      {cells.slice(1)}
    </tr>
  );
}

/** Keeps a link/button inside a linked row clickable. */
export function CellAction({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("relative z-10 inline-flex items-center", className)} {...props} />;
}

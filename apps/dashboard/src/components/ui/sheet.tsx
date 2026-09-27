"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Side panel (a Radix Dialog styled as a drawer). Right side, 480px: row details on Logs, Contacts, Deliveries.
 * Left side: the phone navigation.
 */
export function Sheet({ open, onOpenChange, trigger, title, description, children, footer, side = "right", className }: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "left";
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fs-overlay fixed inset-0 z-50 bg-overlay" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-0 z-50 flex h-dvh w-full flex-col bg-background-elevated text-foreground shadow-pop outline-none",
            side === "right" ? "fs-sheet right-0 max-w-[480px] border-l border-border" : "fs-sheet-left left-0 max-w-[280px] border-r border-border",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogPrimitive.Title className="truncate text-section font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description asChild><div className="text-sm text-foreground-muted">{description}</div></DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-foreground-subtle transition-colors hover:bg-background-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex items-center justify-between gap-2 border-t border-border bg-background-subtle px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Label/value list for sheets and detail panels. */
export function DetailList({ items, className }: { items: Array<[React.ReactNode, React.ReactNode] | null | false>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(88px,max-content)_1fr] gap-x-4 gap-y-2.5 text-sm", className)}>
      {items.filter(Boolean).map((it, i) => {
        const [k, v] = it as [React.ReactNode, React.ReactNode];
        return (
          <React.Fragment key={i}>
            <dt className="text-foreground-muted">{k}</dt>
            <dd className="min-w-0 break-words text-foreground">{v}</dd>
          </React.Fragment>
        );
      })}
    </dl>
  );
}

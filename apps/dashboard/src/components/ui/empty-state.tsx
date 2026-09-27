import * as React from "react";
import { cn } from "@/lib/utils";

/** Icon, title, one sentence, the next step. Optional extra content (a code snippet) under the actions. */
export function EmptyState({ icon, title, children, action, extra, className }: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed border-border-strong bg-background-subtle px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-background-elevated text-foreground-muted shadow-card [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-section font-semibold text-foreground">{title}</h3>
      {children ? <p className="mt-1 max-w-sm text-sm text-foreground-muted">{children}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
      {extra ? <div className="mt-5 w-full max-w-lg text-left">{extra}</div> : null}
    </div>
  );
}

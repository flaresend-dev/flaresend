import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-foreground", className)} {...props} />;
}

/**
 * Label above the control, optional description below it, optional error. Required fields show nothing extra;
 * optional ones show "Optional" at the right of the label row.
 */
export function Field({ label, htmlFor, description, error, optional, children, className }: {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? <span className="text-xs text-foreground-subtle">Optional</span> : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-danger-fg" role="alert">{error}</p>
      ) : description ? (
        <p className="text-xs text-foreground-muted">{description}</p>
      ) : null}
    </div>
  );
}

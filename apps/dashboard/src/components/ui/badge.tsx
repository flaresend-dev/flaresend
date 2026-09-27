import * as React from "react";
import { statusDisplay, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const TONE_CLASS: Record<Tone, string> = {
  info: "border-info-border bg-info-bg text-info-fg",
  violet: "border-violet-border bg-violet-bg text-violet-fg",
  success: "border-success-border bg-success-bg text-success-fg",
  warning: "border-warning-border bg-warning-bg text-warning-fg",
  danger: "border-danger-border bg-danger-bg text-danger-fg",
  muted: "border-muted-border bg-muted-bg text-muted-fg",
  teal: "border-teal-border bg-teal-bg text-teal-fg",
};

/** Text colour only, for timeline dots and inline marks. */
export const TONE_TEXT: Record<Tone, string> = {
  info: "text-info-fg",
  violet: "text-violet-fg",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
  muted: "text-foreground-subtle",
  teal: "text-teal-fg",
};

/** Plain badge: Live/Test, Editable/Built in, counts. */
export function Badge({ tone = "muted", mono, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; mono?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        mono && "font-mono font-normal",
        className,
      )}
      {...props}
    />
  );
}

/** Status pill: dot + display name, coloured by tone. Takes the raw API code. */
export function StatusBadge({ status, label, className }: { status: string | null | undefined; label?: string; className?: string }) {
  const d = statusDisplay(status);
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[d.tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label ?? d.label}
    </span>
  );
}

/** Coloured banner for page-level notes and warnings. */
export function Notice({ tone = "info", icon, title, children, actions, className }: {
  tone?: Tone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 text-sm [&_svg]:size-4 [&_svg]:shrink-0", TONE_CLASS[tone], className)}
    >
      {icon ? <span className="mt-0.5">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-foreground/80 [&_code]:font-mono [&_code]:text-xs")}>{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

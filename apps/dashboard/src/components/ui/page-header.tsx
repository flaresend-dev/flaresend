import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Title left, primary action right, optional one-line description. Same height on every page. */
export function PageHeader({ title, description, actions, back, className }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-1", className)}>
      {back ? (
        <Link
          href={back.href}
          className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-title font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <div className="max-w-3xl text-sm text-foreground-muted">{description}</div> : null}
    </header>
  );
}

"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import { Tooltip } from "./tooltip";
import { toast } from "./toast";

async function copyText(value: string, label = "Copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(label);
    return true;
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.");
    return false;
  }
}

/** Inline mono text. */
export function Code({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <code className={cn("rounded-sm border border-border bg-background-subtle px-1 py-px font-mono text-xs", className)} {...props} />;
}

export function CopyButton({ value, label = "Copy", className, toastLabel }: { value: string; label?: string; className?: string; toastLabel?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={buttonVariants({ variant: "ghost", size: "icon-sm", className })}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await copyText(value, toastLabel)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? <Check className="text-success-fg" /> : <Copy />}
    </button>
  );
}

/** Multi-line mono block with a copy button. */
export function CodeBlock({ code, className, copy = true, maxHeight }: { code: string; className?: string; copy?: boolean; maxHeight?: string }) {
  return (
    <div className={cn("group relative rounded-lg border border-border bg-background-subtle", className)}>
      <pre className="overflow-auto p-4 font-mono text-xs leading-relaxed text-foreground" style={maxHeight ? { maxHeight } : undefined}>
        <code>{code}</code>
      </pre>
      {copy ? <CopyButton value={code} className="absolute top-2 right-2 bg-background-subtle" /> : null}
    </div>
  );
}

function shorten(v: string, n: number) {
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

/**
 * An ID or address, mono, cut to `length` characters with the full value in a tooltip. Click copies it and shows
 * "Copied". With `href` the text is a link and a small copy button sits next to it.
 */
export function IdChip({ value, href, length = 14, className }: { value: string; href?: string; length?: number; className?: string }) {
  const short = shorten(value, length);
  const chip = "inline-flex h-6 max-w-full items-center rounded-sm px-1.5 font-mono text-xs text-foreground-muted transition-colors hover:bg-background-hover hover:text-foreground";
  if (href) {
    return (
      <span className={cn("relative z-10 inline-flex items-center gap-0.5", className)}>
        <Tooltip content={<span className="font-mono">{value}</span>}>
          <Link href={href} className={cn(chip, "underline-offset-2 hover:underline")}>
            {short}
          </Link>
        </Tooltip>
        <CopyButton value={value} label="Copy ID" className="size-6 [&_svg]:size-3" />
      </span>
    );
  }
  return (
    <Tooltip content={<span className="font-mono">{value} · click to copy</span>}>
      <button
        type="button"
        className={cn(chip, "relative z-10 cursor-copy", className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void copyText(value);
        }}
      >
        {short}
      </button>
    </Tooltip>
  );
}

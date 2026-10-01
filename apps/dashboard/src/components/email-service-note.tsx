"use client";
// One line about Cloudflare's policy, next to the control that sends. It informs; it never blocks.
import { useEffect, useState } from "react";
import { ArrowUpRight, Info, X } from "lucide-react";
import { NEWSLETTER_POLICY_URL } from "@flaresend/types";
import { cn } from "@/lib/utils";

const KEY = "fs-email-service-note";

export function EmailServiceNote({ className }: { className?: string }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-foreground-muted", className)}>
      <Info className="size-3.5 shrink-0" aria-hidden />
      <span>
        Cloudflare Email Service is for transactional email.{" "}
        <a
          href={NEWSLETTER_POLICY_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-foreground underline-offset-2 hover:underline"
        >
          Cloudflare docs <ArrowUpRight className="size-3" aria-hidden />
        </a>
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* storage blocked: hidden for this visit only */
          }
        }}
        className="ml-0.5 rounded p-0.5 text-foreground-subtle hover:bg-background-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3" />
      </button>
    </p>
  );
}

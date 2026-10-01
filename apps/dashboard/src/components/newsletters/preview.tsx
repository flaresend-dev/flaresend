"use client";
// Email, website and plain-text preview of the saved draft, rendered by the mailer's own renderer.
import { useCallback, useEffect, useState } from "react";
import { Monitor, Send, Smartphone } from "lucide-react";
import type { NewsletterPostRecord, NewsletterPreview, NewsletterSubscriptionRecord } from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { Segmented } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toastError, toastSuccess } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Target = "email" | "web" | "text";
const SAMPLE = "sample";

export function PreviewFrame({
  slug, post, subscribers, refreshKey = 0, height = "70vh", compact = false,
}: {
  slug: string;
  post: Pick<NewsletterPostRecord, "id" | "publicationId">;
  subscribers: Array<Pick<NewsletterSubscriptionRecord, "id" | "email" | "firstName" | "lastName">>;
  refreshKey?: number | string;
  height?: string;
  compact?: boolean;
}) {
  const [target, setTarget] = useState<Target>("email");
  const [width, setWidth] = useState<"desktop" | "phone">(compact ? "phone" : "desktop");
  const [reader, setReader] = useState(SAMPLE);
  const [data, setData] = useState<NewsletterPreview | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const r = await newsletterAction(slug, "previewNewsletterPost", post.publicationId, post.id, target, reader === SAMPLE ? undefined : reader);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    setData({
      ...r.data,
      html: r.data.html.replace(
        /newsletter-asset:([a-zA-Z0-9_-]+)/g,
        (_, id) => `/api/newsletter-assets/${post.publicationId}/${id}?project=${encodeURIComponent(slug)}`,
      ),
    });
  }, [slug, post.publicationId, post.id, target, reader]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load, refreshKey]);

  const who = subscribers.find((s) => s.id === reader);
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background-subtle">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background-elevated p-2">
        <Segmented
          ariaLabel="Preview type"
          value={target}
          onChange={setTarget}
          options={[
            { value: "email", label: "Email" },
            { value: "web", label: "Website" },
            { value: "text", label: "Plain text" },
          ]}
        />
        {target !== "text" ? (
          <Segmented
            ariaLabel="Preview width"
            value={width}
            onChange={setWidth}
            options={[
              { value: "desktop", label: <Monitor className="size-3.5" aria-label="Desktop width" /> },
              { value: "phone", label: <Smartphone className="size-3.5" aria-label="Phone width" /> },
            ]}
          />
        ) : null}
      </div>
      {target === "email" && data ? (
        <div className="truncate border-b border-border px-4 py-2 text-xs">
          <span className="text-foreground-muted">Subject </span>
          <span className="font-medium">{data.subject || "No subject"}</span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-3" style={{ height }}>
        {error ? (
          <p role="alert" className="p-4 text-sm text-danger-fg">{error}</p>
        ) : !data ? (
          <div className="mx-auto flex max-w-[600px] flex-col gap-3 rounded bg-background-elevated p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : target === "text" ? (
          <pre className="mx-auto max-w-[680px] rounded bg-background-elevated p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap">{data.text}</pre>
        ) : (
          <iframe
            title="Rendered newsletter"
            sandbox=""
            srcDoc={data.html}
            className={cn("mx-auto block h-full min-h-[480px] rounded bg-white shadow-card", width === "phone" ? "w-[375px]" : "w-[680px]")}
            style={{ maxWidth: "100%" }}
          />
        )}
      </div>
      {target !== "web" ? (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-background-elevated px-3 py-2 text-xs text-foreground-muted">
          <span className="truncate">
            Previewing as {who ? [who.firstName, who.lastName].filter(Boolean).join(" ") || who.email : "Ada Lovelace (sample)"}
          </span>
          {subscribers.length ? (
            <Select
              ariaLabel="Preview as"
              className="h-7 w-44 text-xs"
              value={reader}
              onValueChange={setReader}
              options={[
                { value: SAMPLE, label: "Sample reader" },
                ...subscribers.slice(0, 100).map((s) => ({ value: s.id, label: s.email })),
              ]}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const TEST_KEY = "fs-nl-test-to";

/** "Send a test": the saved draft to up to five addresses. */
export function SendTestButton({
  slug, post, disabledReason, size = "md",
}: {
  slug: string;
  post: Pick<NewsletterPostRecord, "id" | "publicationId">;
  disabledReason?: string | null;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setTo(localStorage.getItem(TEST_KEY) ?? "");
    } catch {
      /* storage blocked */
    }
  }, []);
  const list = to.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const valid = list.length > 0 && list.length <= 5 && list.every((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  const send = async () => {
    setBusy(true);
    const r = await newsletterAction(slug, "sendNewsletterTest", post.publicationId, post.id, { to: list });
    setBusy(false);
    if (!r.ok) {
      toastError(r.error.message);
      return;
    }
    try {
      localStorage.setItem(TEST_KEY, list.join(", "));
    } catch {
      /* storage blocked */
    }
    toastSuccess(`Test sent to ${list.join(", ")}.`);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size={size} disabled={!!disabledReason} title={disabledReason ?? undefined}>
          <Send /> Send a test
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void send();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Send the saved draft to</span>
            <Input autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" aria-invalid={!!to && !valid} />
            <span className="text-xs text-foreground-muted">Up to five addresses, separated by commas. The subject starts with [Test].</span>
          </label>
          <Button type="submit" variant="primary" loading={busy} disabled={!valid}>
            Send test
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

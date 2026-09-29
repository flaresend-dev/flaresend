"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, ScrollText, X } from "lucide-react";
import { EMAIL_EVENT_TYPES, type EventRecord, type ListResponse } from "@flaresend/types";
import { formatUiError, type UiError } from "@/lib/errors";
import { age } from "@/lib/format";
import { eventSummary, statusLabel } from "@/lib/labels";
import { ALL, p } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { IdChip } from "@/components/ui/code";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { DetailList, Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { Tooltip } from "@/components/ui/tooltip";
import { EventData } from "@/components/event-data";

const INTERVAL_MS = 10_000;

type Page = { error?: UiError } & Partial<ListResponse<EventRecord>>;

/**
 * Email events for one project (or every project when `slug` is ALL), newest first. Polls /api/events every 10 s while Live is on and the tab is visible;
 * rows that arrive from a poll flash briefly. "Load older" follows the cursor.
 */
export function LogStream({ slug, initial, type, emailId }: { slug: string; initial: ListResponse<EventRecord>; type: string; emailId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [events, setEvents] = useState(initial.data);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [error, setError] = useState<UiError | null>(null);
  const [live, setLive] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [, tick] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState<"refresh" | "older" | null>(null);
  const known = useRef(new Set(initial.data.map((e) => e.id)));

  const qs = useCallback(
    (extra: Record<string, string> = {}) => {
      const u = new URLSearchParams(slug === ALL ? {} : { project: slug });
      if (type) u.set("type", type);
      if (emailId) u.set("emailId", emailId);
      for (const [k, v] of Object.entries(extra)) u.set(k, v);
      return u.toString();
    },
    [slug, type, emailId],
  );

  const fetchPage = useCallback(
    async (extra?: Record<string, string>): Promise<ListResponse<EventRecord> | null> => {
      try {
        const res = await fetch(`/api/events?${qs(extra)}`, { cache: "no-store" });
        const body = (await res.json()) as Page;
        if (!res.ok) throw body.error ?? { code: `http_${res.status}`, message: res.statusText };
        setError(null);
        return body as ListResponse<EventRecord>;
      } catch (e) {
        setError(e && typeof e === "object" && "code" in e ? (e as UiError) : { code: "network_error", message: String(e) });
        return null;
      }
    },
    [qs],
  );

  const refresh = useCallback(async () => {
    const page = await fetchPage();
    if (!page) return;
    const added = page.data.filter((e) => !known.current.has(e.id)).map((e) => e.id);
    for (const id of added) known.current.add(id);
    if (added.length) {
      setFresh(new Set(added));
      setTimeout(() => setFresh(new Set()), 1100);
    }
    // Merge the newest page into what is loaded, keeping older pages fetched with "Load older".
    setEvents((old) => {
      const seen = new Set(page.data.map((e) => e.id));
      const oldest = page.data.at(-1)?.createdAt ?? "";
      return [...page.data, ...old.filter((e) => !seen.has(e.id) && e.createdAt < oldest)];
    });
    setUpdatedAt(Date.now());
  }, [fetchPage]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [live, refresh]);

  // Keeps "Updated 3s ago" moving.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const loadOlder = async () => {
    if (!nextCursor) return;
    setLoading("older");
    const page = await fetchPage({ cursor: nextCursor });
    setLoading(null);
    if (!page) return;
    for (const e of page.data) known.current.add(e.id);
    setEvents((old) => [...old, ...page.data.filter((e) => !old.some((o) => o.id === e.id))]);
    setNextCursor(page.nextCursor);
  };

  const setParam = (k: "type" | "emailId", v: string) => {
    const u = new URLSearchParams();
    const next = { type, emailId, [k]: v };
    if (next.type) u.set("type", next.type);
    if (next.emailId) u.set("emailId", next.emailId);
    router.push(u.toString() ? `${pathname}?${u}` : pathname);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          ariaLabel="Event type"
          className="w-44"
          value={type || "all"}
          onValueChange={(v) => setParam("type", v === "all" ? "" : v)}
          options={[{ value: "all", label: "All events" }, ...EMAIL_EVENT_TYPES.map((t) => ({ value: t, label: statusLabel(t) }))]}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={live} onCheckedChange={setLive} aria-label="Live updates" />
          <span className={cn("flex items-center gap-1.5", live ? "text-foreground" : "text-foreground-muted")}>
            {live ? <span className="size-1.5 animate-pulse rounded-full bg-success-fg" aria-hidden /> : null}
            Live
          </span>
        </label>
        <span className="text-xs text-foreground-muted tabular-nums" suppressHydrationWarning>
          Updated {age(new Date(updatedAt).toISOString())}
        </span>
        <Tooltip content="Refresh now">
          <button
            type="button"
            aria-label="Refresh now"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            onClick={async () => {
              setLoading("refresh");
              await refresh();
              setLoading(null);
            }}
          >
            <RefreshCw className={cn(loading === "refresh" && "animate-spin")} />
          </button>
        </Tooltip>
        {emailId ? (
          <button
            type="button"
            onClick={() => setParam("emailId", "")}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-background-subtle pr-1.5 pl-2.5 text-xs transition-colors hover:bg-background-hover"
            aria-label="Remove email filter"
          >
            Email <span className="font-mono">{emailId.length > 14 ? `${emailId.slice(0, 14)}…` : emailId}</span>
            <X className="size-3 text-foreground-subtle" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mb-4 break-all rounded-md border border-danger-border bg-danger-bg px-3 py-2 font-mono text-xs text-danger-fg">
          {formatUiError(error)}
        </p>
      ) : null}

      {events.length ? (
        <Table>
          <THead>
            <tr>
              <TH className="w-[100px]">Time</TH>
              <TH className="w-[160px]">Event</TH>
              <TH className="w-[26%]">Recipient</TH>
              <TH className="hidden w-[170px] md:table-cell">Email</TH>
              <TH>Details</TH>
            </tr>
          </THead>
          <TBody>
            {events.map((ev) => (
              <tr
                key={ev.id}
                tabIndex={0}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-background-hover focus-visible:bg-background-hover focus-visible:outline-none",
                  fresh.has(ev.id) && "fs-row-new",
                )}
                onClick={(e) => !(e.target as HTMLElement).closest("button,a") && setOpen(ev)}
                onKeyDown={(e) => e.key === "Enter" && setOpen(ev)}
              >
                <TD className="text-foreground-muted">
                  <Time iso={ev.createdAt} />
                </TD>
                <TD>
                  <StatusBadge status={ev.type} />
                </TD>
                <TD className="truncate font-mono text-xs">{ev.recipient ?? <span className="text-foreground-subtle">—</span>}</TD>
                <TD className="hidden md:table-cell">
                  <IdChip value={ev.emailId} href={p(slug, "emails", ev.emailId)} className="-ml-1.5" />
                </TD>
                <TD className="truncate text-xs text-foreground-muted">{eventSummary(ev.data) || "—"}</TD>
              </tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={<ScrollText />} title={type || emailId ? "No events match" : "No events yet"}>
          {live ? "New events appear here within 10 seconds." : "Turn on Live to watch for new events."}
        </EmptyState>
      )}

      {nextCursor ? (
        <div className="flex justify-center pt-4">
          <Button variant="secondary" loading={loading === "older"} onClick={() => void loadOlder()}>
            Load older
          </Button>
        </div>
      ) : null}

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)} title={open ? statusLabel(open.type) : "Event"} description={open ? <span className="font-mono text-xs">{open.type}</span> : undefined}>
        {open ? (
          <div className="flex flex-col gap-5">
            <DetailList
              items={[
                ["Event", <StatusBadge key="t" status={open.type} />],
                ["Time", <Time key="a" iso={open.createdAt} format="absolute" />],
                ["Recipient", open.recipient ? <span className="font-mono text-xs">{open.recipient}</span> : "—"],
                [
                  "Email",
                  <Link key="e" href={p(slug, "emails", open.emailId)} className="font-mono text-xs underline-offset-2 hover:underline">
                    {open.emailId}
                  </Link>,
                ],
                ["Event ID", <IdChip key="i" value={open.id} length={24} className="-ml-1.5" />],
              ]}
            />
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground-muted">Data</h3>
              <div className="rounded-md border border-border bg-background-subtle p-3">
                <EventData data={open.data} />
              </div>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

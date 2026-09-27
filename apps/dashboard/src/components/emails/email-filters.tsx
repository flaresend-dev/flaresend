"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ListFilter, Search, X } from "lucide-react";
import { EMAIL_RANGE_LABELS, isEmailRange, type EmailRange } from "@/lib/email-query";
import { EMAIL_STATUS_ORDER, statusLabel } from "@/lib/labels";
import { SEARCH_KEYS, parseEmailSearch } from "@/lib/search";
import { p } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Select } from "@/components/ui/select";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field } from "@/components/ui/field";

type Patch = Record<string, string | null>;

function fmtDay(d: string) {
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isNaN(t) ? d : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(t);
}

/**
 * The Emails filter bar: search box, Status, date range, and a Filter popover for recipient/subject/tag. Every
 * change is a URL change (shareable), and resets the cursor.
 */
export function EmailFilters({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";

  const push = (patch: Patch) => {
    const u = new URLSearchParams(sp.toString());
    u.delete("cursor");
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    const qs = u.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const status = get("status");
  const range = get("range");
  const since = get("since");
  const until = get("until");
  const dateLabel = isEmailRange(range)
    ? EMAIL_RANGE_LABELS[range]
    : since || until
      ? `${since ? fmtDay(since) : "…"} – ${until ? fmtDay(until) : "now"}`
      : "All time";

  const chips: Array<{ label: string; clear: Patch }> = [];
  if (status) chips.push({ label: `Status: ${statusLabel(status)}`, clear: { status: null } });
  if (isEmailRange(range)) chips.push({ label: EMAIL_RANGE_LABELS[range], clear: { range: null } });
  else if (since || until) chips.push({ label: dateLabel, clear: { since: null, until: null } });
  if (get("to")) chips.push({ label: `To: ${get("to")}`, clear: { to: null } });
  if (get("q")) chips.push({ label: `Subject: ${get("q")}`, clear: { q: null } });
  if (get("tag")) chips.push({ label: `Tag: ${get("tag")}`, clear: { tag: null } });

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          key={`${get("to")}|${get("tag")}|${get("q")}`}
          initial={get("to") || get("tag") || get("q")}
          onSubmit={(text) => {
            const intent = parseEmailSearch(text);
            if (intent.kind === "redirect") return router.push(p(slug, "emails", intent.emailId));
            const clear = Object.fromEntries(SEARCH_KEYS.map((k) => [k, null])) as Patch;
            push(intent.kind === "filter" ? { ...clear, [intent.key]: intent.value } : clear);
          }}
        />
        <Select
          ariaLabel="Status"
          className="w-auto min-w-36 sm:w-44"
          value={status || "all"}
          onValueChange={(v) => push({ status: v === "all" ? null : v })}
          options={[{ value: "all", label: "All statuses" }, ...EMAIL_STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) }))]}
        />
        <DateFilter label={dateLabel} range={range} since={since} until={until} onChange={push} />
        <MoreFilters to={get("to")} q={get("q")} tag={get("tag")} onApply={push} />
      </div>
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => push(c.clear)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-background-subtle pr-1.5 pl-2.5 text-xs text-foreground transition-colors hover:bg-background-hover"
              aria-label={`Remove filter ${c.label}`}
            >
              <span className="max-w-64 truncate">{c.label}</span>
              <X className="size-3 text-foreground-subtle" />
            </button>
          ))}
          <button type="button" className="ml-1 text-xs font-medium text-foreground-muted hover:text-foreground" onClick={() => router.push(pathname)}>
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SearchBox({ initial, onSubmit }: { initial: string; onSubmit: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <form
      role="search"
      className="min-w-0 flex-1 basis-64"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(text);
      }}
    >
      <Input
        data-page-search
        type="search"
        aria-label="Search emails"
        placeholder="Search by recipient, subject, or email ID"
        value={text}
        onChange={(e) => setText(e.target.value)}
        prefix={<Search />}
        suffix={<Kbd className="hidden sm:inline-flex">/</Kbd>}
        spellCheck={false}
      />
    </form>
  );
}

function DateFilter({ label, range, since, until, onChange }: { label: string; range: string; since: string; until: string; onChange: (p: Patch) => void }) {
  const [custom, setCustom] = useState({ since, until });
  const options: Array<{ value: EmailRange | "all"; label: string }> = [
    ...(Object.keys(EMAIL_RANGE_LABELS) as EmailRange[]).map((r) => ({ value: r, label: EMAIL_RANGE_LABELS[r] })),
    { value: "all", label: "All time" },
  ];
  const current = isEmailRange(range) ? range : since || until ? "custom" : "all";
  return (
    <Popover>
      <PopoverTrigger className={buttonVariants({ variant: "secondary", className: "min-w-36 justify-between font-normal" })}>
        <span className="flex items-center gap-2">
          <CalendarDays className="text-foreground-muted" />
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        {options.map((o) => (
          <PopoverClose key={o.value} asChild>
            <button
              type="button"
              onClick={() => onChange({ range: o.value === "all" ? null : o.value, since: null, until: null })}
              className={cn(
                "flex h-8 w-full items-center rounded-md px-2 text-left text-sm transition-colors hover:bg-background-hover",
                current === o.value && "font-medium",
              )}
            >
              {o.label}
            </button>
          </PopoverClose>
        ))}
        <div className="mt-1 border-t border-border p-2">
          <p className="mb-2 text-xs font-medium text-foreground-muted">Custom (UTC days)</p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" aria-label="From" value={custom.since} onChange={(e) => setCustom((c) => ({ ...c, since: e.target.value }))} />
            <Input type="date" aria-label="To" value={custom.until} onChange={(e) => setCustom((c) => ({ ...c, until: e.target.value }))} />
          </div>
          <PopoverClose asChild>
            <Button
              size="sm"
              variant="primary"
              className="mt-2 w-full"
              disabled={!custom.since && !custom.until}
              onClick={() => onChange({ range: null, since: custom.since || null, until: custom.until || null })}
            >
              Apply
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MoreFilters({ to, q, tag, onApply }: { to: string; q: string; tag: string; onApply: (p: Patch) => void }) {
  const [open, setOpen] = useState(false);
  const count = [to, q, tag].filter(Boolean).length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={buttonVariants({ variant: "secondary", className: "font-normal" })}>
        <ListFilter className="text-foreground-muted" />
        Filter
        {count ? <span className="rounded-full bg-primary px-1.5 text-2xs font-medium text-primary-foreground tabular-nums">{count}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          key={`${to}|${q}|${tag}|${open}`}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const v = (k: string) => String(fd.get(k) ?? "").trim() || null;
            onApply({ to: v("to"), q: v("q"), tag: v("tag") });
            setOpen(false);
          }}
        >
          <Field label="Recipient" htmlFor="f-to">
            <Input id="f-to" name="to" defaultValue={to} placeholder="ada@example.com" />
          </Field>
          <Field label="Subject contains" htmlFor="f-q">
            <Input id="f-q" name="q" defaultValue={q} placeholder="invoice" />
          </Field>
          <Field label="Tag" htmlFor="f-tag" description="key:value, for example plan:pro">
            <Input id="f-tag" name="tag" defaultValue={tag} placeholder="plan:pro" className="font-mono" pattern="[^:\s]+:.+" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onApply({ to: null, q: null, tag: null });
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

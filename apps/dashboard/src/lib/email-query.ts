// URL search params <-> AdminListEmailsQuery for the email list pages. Pure; unit tested.
import type { AdminListEmailsQuery, EmailStatus } from "@flaresend/types";
import { EmailStatus as EmailStatusSchema } from "@flaresend/types";

export type SearchParams = Record<string, string | string[] | undefined>;

export const EMAIL_FILTER_KEYS = ["status", "range", "since", "until", "to", "q", "tag"] as const;

/** The Emails page date filter. `range` is relative to the request time; `since`/`until` are a custom UTC-day range. */
export const EMAIL_RANGES = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30, "90d": 24 * 90 } as const;
export type EmailRange = keyof typeof EMAIL_RANGES;
export const EMAIL_RANGE_LABELS: Record<EmailRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export function isEmailRange(v: string): v is EmailRange {
  return Object.hasOwn(EMAIL_RANGES, v);
}

export function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date inputs (YYYY-MM-DD, UTC days) become ISO bounds; invalid values are dropped rather than sent. */
export function toEmailQuery(sp: SearchParams, opts: { project?: string; limit?: number; now?: number } = {}): AdminListEmailsQuery {
  const q: AdminListEmailsQuery = { limit: opts.limit ?? 50 };
  const project = opts.project ?? first(sp.project);
  if (project) q.project = project;
  const status = first(sp.status);
  if (status && EmailStatusSchema.safeParse(status).success) q.status = status as EmailStatus;
  const range = first(sp.range);
  if (isEmailRange(range)) {
    q.since = new Date((opts.now ?? Date.now()) - EMAIL_RANGES[range] * 3_600_000).toISOString();
  } else {
    const since = first(sp.since);
    if (DATE_RE.test(since)) q.since = `${since}T00:00:00.000Z`;
    const until = first(sp.until);
    if (DATE_RE.test(until)) q.until = `${until}T23:59:59.999Z`;
  }
  for (const k of ["to", "q", "cursor"] as const) {
    const v = first(sp[k]);
    if (v) q[k] = v;
  }
  const tag = first(sp.tag);
  if (tag && /^[^:]+:.*$/.test(tag)) q.tag = tag;
  return q;
}

/** True when any list filter (not the cursor) is set. */
export function hasEmailFilters(sp: SearchParams): boolean {
  return EMAIL_FILTER_KEYS.some((k) => first(sp[k]) !== "");
}

/** Builds `base?filters&cursor=` keeping the current filters. */
export function withParams(base: string, sp: SearchParams, patch: Record<string, string | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = first(v);
    if (s) u.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") u.delete(k);
    else u.set(k, v);
  }
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

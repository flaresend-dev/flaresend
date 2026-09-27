// Small display helpers. Pure.

export function age(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const s = Math.round((now - t) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const txt =
    a < 60 ? `${a}s` : a < 3600 ? `${Math.floor(a / 60)}m` : a < 86400 ? `${Math.floor(a / 3600)}h` : `${Math.floor(a / 86400)}d`;
  return future ? `in ${txt}` : `${txt} ago`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function pct(rate: number | null | undefined, digits = 1): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return "-";
  // The mailer returns rates as fractions (0..1).
  return `${(rate * 100).toFixed(digits)}%`;
}

export function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

export function ms(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`;
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** `<input type="datetime-local">` value (local time, no zone) -> ISO string with offset, or null. */
export function localInputToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO -> value for `<input type="datetime-local">` in the viewer's local time. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Comma / newline separated list -> trimmed, non-empty items. */
export function splitList(v: string | null | undefined): string[] {
  return (v ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

/** "12,480" */
export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? "-" : n.toLocaleString("en-US");
}

/**
 * "Sep 25, 2026, 2:03 PM" (or "Sep 25, 2026" with `dateOnly`) in the given zone. The Time component passes
 * `timeZone: "UTC"` for the server render and the viewer's zone after it mounts.
 */
export function formatAbsolute(iso: string | null | undefined, opts: { timeZone?: string; dateOnly?: boolean; seconds?: boolean } = {}): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(opts.dateOnly ? {} : { hour: "numeric", minute: "2-digit", ...(opts.seconds ? { second: "2-digit" } : {}) }),
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(d);
}

/** "2:03:14 PM" */
export function formatClock(iso: string | null | undefined, opts: { timeZone?: string } = {}): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) }).format(d);
}

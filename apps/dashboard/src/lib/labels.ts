// Display names and colours for every status code the API returns (section 2.4). The API keeps lowercase codes;
// the UI never shows them raw. Pure; unit tested.
import { ms } from "./format";

/** Pill colours. Each maps to the `--{tone}-bg/fg/border` tokens in globals.css. */
export type Tone = "info" | "violet" | "success" | "warning" | "danger" | "muted" | "teal";

interface Display {
  label: string;
  tone: Tone;
}

const STATUS: Record<string, Display> = {
  // emails, recipients, broadcasts
  queued: { label: "Queued", tone: "info" },
  scheduled: { label: "Scheduled", tone: "violet" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  deferred: { label: "Delivery delayed", tone: "warning" },
  bounced: { label: "Bounced", tone: "danger" },
  complained: { label: "Complained", tone: "danger" },
  rejected: { label: "Rejected", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  test: { label: "Test", tone: "muted" },
  canceled: { label: "Canceled", tone: "muted" },
  draft: { label: "Draft", tone: "muted" },
  // events only
  opened: { label: "Opened", tone: "teal" },
  clicked: { label: "Clicked", tone: "teal" },
  retrying: { label: "Retrying", tone: "warning" },
  // domains
  onboarded: { label: "Verified", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  missing: { label: "Not started", tone: "danger" },
  unknown: { label: "Unknown", tone: "muted" },
  // API keys
  active: { label: "Active", tone: "success" },
  revoked: { label: "Revoked", tone: "muted" },
  expired: { label: "Expired", tone: "warning" },
  // webhooks + deliveries (delivery "pending" and "failed" share the rows above)
  enabled: { label: "Enabled", tone: "success" },
  disabled: { label: "Disabled", tone: "muted" },
  success: { label: "Success", tone: "success" },
  // contacts
  subscribed: { label: "Subscribed", tone: "success" },
  unsubscribed: { label: "Unsubscribed", tone: "muted" },
  // projects
  paused: { label: "Sending paused", tone: "danger" },
};

/** "email.delivered" -> "delivered" */
export function eventCode(type: string): string {
  return type.replace(/^email\./, "");
}

/** "hard_bounce" -> "Hard bounce" */
export function titleCase(code: string): string {
  const s = code.replace(/[_.-]+/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Display name + tone for a status or event code. Unknown codes: Title Case, muted. */
export function statusDisplay(code: string | null | undefined): Display {
  if (!code) return { label: "Unknown", tone: "muted" };
  const c = eventCode(code.toLowerCase());
  return STATUS[c] ?? { label: titleCase(c), tone: "muted" };
}

export function statusLabel(code: string | null | undefined): string {
  return statusDisplay(code).label;
}

/** The older coarse tone families (kept for callers and tests from before the redesign). */
export type ToneFamily = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

/**
 * Coarse tone family of a code: violet counts as info and teal as success. Known codes follow the table above;
 * codes that are not in the table are "neutral", and a missing code is "muted".
 */
export function statusTone(status: string | null | undefined): ToneFamily {
  if (!status) return "muted";
  const d = STATUS[eventCode(status.toLowerCase())];
  if (!d) return "neutral";
  return d.tone === "violet" ? "info" : d.tone === "teal" ? "success" : d.tone;
}

/** Suppression reasons are shown as plain text, not pills. */
export const SUPPRESSION_REASONS = { hard_bounce: "Hard bounce", complaint: "Complaint", manual: "Manual" } as const;
export function reasonLabel(reason: string): string {
  return (SUPPRESSION_REASONS as Record<string, string>)[reason] ?? titleCase(reason);
}

/** Email statuses in the order the Status filter lists them. */
export const EMAIL_STATUS_ORDER = [
  "queued", "scheduled", "sending", "sent", "delivered", "deferred",
  "bounced", "complained", "rejected", "failed", "test", "canceled",
] as const;

/** Stat tiles on a broadcast, in this order (section 6.3). */
export const BROADCAST_COUNT_KEYS = ["sent", "delivered", "bounced", "complained", "opened", "clicked"] as const;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * One-line summary of an event's `data` for the Logs table:
 * delivered/deferred "250 OK · 1.2 s", bounced "Hard bounce", failed the error code, otherwise the first data key.
 */
export function eventSummary(data: unknown): string {
  const d = obj(data);
  if (!d) return data === null || data === undefined ? "" : clip(String(data));

  const bounce = obj(d.bounce);
  if (bounce) {
    const type = text(bounce.type);
    return type ? `${titleCase(type)} bounce` : "Bounce";
  }
  const code = text(d.code);
  if (code) return code;
  const failure = obj(d.failure) ?? obj(d.rejection);
  if (failure && text(failure.reason)) return clip(text(failure.reason)!);
  const complaint = obj(d.complaint);
  if (complaint) return text(complaint.type) ? `Complaint: ${text(complaint.type)}` : "Complaint";

  const delivery = obj(d.delivery);
  if (delivery) {
    const status = text(delivery.smtpStatusCode);
    const resp = text(delivery.smtpResponse);
    const smtp = resp ? (status && !resp.startsWith(status) ? `${status} ${resp}` : resp) : status;
    const time = typeof delivery.deliveryTimeMs === "number" ? ms(delivery.deliveryTimeMs) : null;
    const parts = [smtp ? clip(smtp, 60) : null, time].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }

  const entry = Object.entries(d).find(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entry) return "";
  const [k, v] = entry;
  return clip(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
}

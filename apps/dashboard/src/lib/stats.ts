// Turns a StatsRecord bucket (email count per status) into the overview card numbers. Pure; unit tested.

const NOT_SENT = new Set(["test", "canceled", "scheduled"]);

export interface StatSummary {
  /** Emails created in the window that were (or are being) sent for real: all statuses except test/canceled/scheduled. */
  sent: number;
  delivered: number;
  /** delivered / sent, or null when nothing was sent. */
  deliveredRate: number | null;
  bounced: number;
  failed: number;
  complained: number;
  inFlight: number;
}

export function summarizeStats(counts: Record<string, number> | null | undefined): StatSummary {
  const c = counts ?? {};
  let sent = 0;
  for (const [status, n] of Object.entries(c)) if (!NOT_SENT.has(status)) sent += n;
  const get = (k: string) => c[k] ?? 0;
  return {
    sent,
    delivered: get("delivered"),
    deliveredRate: sent > 0 ? get("delivered") / sent : null,
    bounced: get("bounced"),
    failed: get("failed") + get("rejected"),
    complained: get("complained"),
    inFlight: get("queued") + get("sending") + get("sent") + get("deferred"),
  };
}

import type { EmailStatus } from "@flaresend/types";

/** Email statuses that are final failures. Priority order: complained > bounced > rejected > failed. */
export const TERMINAL_FAILURES = ["complained", "bounced", "rejected", "failed"] as const;
const FAILURE_RANK: Record<string, number> = { complained: 4, bounced: 3, rejected: 2, failed: 1 };

export function isTerminalFailure(s: string): boolean {
  return s in FAILURE_RANK;
}

/**
 * Pure reducer from recipient statuses to the email status.
 * An email with a terminal failure never goes back to sent/delivered/deferred, and a
 * lower-priority failure never replaces a higher one.
 */
export function reduceEmailStatus(current: EmailStatus, recipients: string[]): EmailStatus {
  let next: EmailStatus = current;
  if (recipients.includes("complained")) next = "complained";
  else if (recipients.includes("bounced")) next = "bounced";
  else if (recipients.includes("rejected")) next = "rejected";
  else if (recipients.includes("failed")) next = "failed";
  else if (recipients.length > 0 && recipients.every((s) => s === "delivered")) next = "delivered";
  else if (recipients.includes("deferred")) next = "deferred";

  const curRank = FAILURE_RANK[current] ?? 0;
  const nextRank = FAILURE_RANK[next] ?? 0;
  if (curRank > 0 && nextRank < curRank) return current;
  return next;
}

/**
 * Recipient-level "no downgrade" rule. A new status only replaces the
 * current one if it ranks at least as high. deferred never replaces delivered or a failure;
 * a complaint after delivery does replace delivered.
 */
const RECIPIENT_RANK: Record<string, number> = {
  queued: 0, test: 0, sent: 0, deferred: 1, delivered: 2, failed: 3, rejected: 3, bounced: 4, complained: 5,
};

export function shouldUpdateRecipient(current: string, incoming: string): boolean {
  return (RECIPIENT_RANK[incoming] ?? 0) >= (RECIPIENT_RANK[current] ?? 0);
}

// ---- SQL mirrors of the two rules above ----
// The events consumer applies these inside one D1 batch (a transaction), so events for different recipients
// of the same email that are processed in parallel can never compute the email status from stale rows.

function rankCase(expr: string, ranks: Record<string, number>): string {
  return `(CASE ${expr} ${Object.entries(ranks).map(([k, v]) => `WHEN '${k}' THEN ${v}`).join(" ")} ELSE 0 END)`;
}

/** SQL for "incoming ranks at least as high as the recipient's current status". `?1` = incoming status. */
export function recipientNoDowngradeSql(column = "status", incomingParam = "?1"): string {
  return `${rankCase(column, RECIPIENT_RANK)} <= ${rankCase(incomingParam, RECIPIENT_RANK)}`;
}

/**
 * UPDATE that recomputes emails.status from email_recipients with the same priority rules as
 * reduceEmailStatus, and sets delivered_at / failed_at the first time. Params: ?1 = email id, ?2 = event time.
 */
export const REDUCE_EMAIL_STATUS_SQL = (() => {
  const agg = `(SELECT CASE
      WHEN SUM(status = 'complained') > 0 THEN 'complained'
      WHEN SUM(status = 'bounced') > 0 THEN 'bounced'
      WHEN SUM(status = 'rejected') > 0 THEN 'rejected'
      WHEN SUM(status = 'failed') > 0 THEN 'failed'
      WHEN COUNT(*) > 0 AND SUM(status <> 'delivered') = 0 THEN 'delivered'
      WHEN SUM(status = 'deferred') > 0 THEN 'deferred'
      ELSE NULL END
    FROM email_recipients WHERE email_id = ?1)`;
  const next = `COALESCE(${agg}, status)`;
  const final = `(CASE WHEN ${rankCase("status", FAILURE_RANK)} > ${rankCase(next, FAILURE_RANK)} THEN status ELSE ${next} END)`;
  return `UPDATE emails SET
    delivered_at = CASE WHEN delivered_at IS NULL AND ${final} = 'delivered' THEN ?2 ELSE delivered_at END,
    failed_at = CASE WHEN failed_at IS NULL AND ${final} IN ('complained','bounced','rejected','failed') THEN ?2 ELSE failed_at END,
    status = ${final}
  WHERE id = ?1`;
})();

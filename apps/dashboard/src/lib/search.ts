// The Emails page search box: one text input, routed to the right list filter. Pure; unit tested.

/** Email ids are `email_` + a ULID (apps/mailer/src/core/ids.ts). */
export const EMAIL_ID_RE = /^email_[0-9A-Z]{26}$/;
const TAG_RE = /^[^:\s]+:.+$/;

export type SearchIntent =
  | { kind: "empty" }
  | { kind: "redirect"; emailId: string }
  | { kind: "filter"; key: "to" | "tag" | "q"; value: string };

export function parseEmailSearch(input: string): SearchIntent {
  const v = input.trim();
  if (!v) return { kind: "empty" };
  if (EMAIL_ID_RE.test(v)) return { kind: "redirect", emailId: v };
  if (v.includes("@")) return { kind: "filter", key: "to", value: v };
  if (TAG_RE.test(v)) return { kind: "filter", key: "tag", value: v };
  return { kind: "filter", key: "q", value: v };
}

/** Keys the search box can set. The box replaces all three so one search does not stack onto the last one. */
export const SEARCH_KEYS = ["to", "tag", "q"] as const;

// Pure validation helpers used by core/send.ts. Every failure throws an ApiError.
import { domainOf, parseDisplayAddress, type Attachment } from "@flaresend/types";
import { ApiError } from "../http/errors";
import { allowedDomains, allowedSenders, type ProjectRow } from "../db/projects";
import type { RecipientKind } from "../db/recipients";

export const MAX_RECIPIENTS = 50;
export const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_HEADER_VALUE_BYTES = 2048;
export const MAX_HEADERS_TOTAL_BYTES = 16 * 1024;
export const MAX_NON_X_HEADERS = 20;

const RESERVED_HEADERS = new Set([
  "from", "to", "cc", "bcc", "subject", "reply-to", "date", "message-id", "content-type", "mime-version",
]);
const HEADER_FIELD_TO_PARAM: Record<string, string> = {
  from: "from", to: "to", cc: "cc", bcc: "bcc", subject: "subject", "reply-to": "replyTo",
};

export interface Sender {
  address: string;
  name: string | null;
}

/** Step 2: resolve `from` (input or project.default_from) and check it against the project's allow-lists. */
export function resolveSender(from: string | undefined, project: ProjectRow): Sender {
  const raw = from ?? project.default_from ?? undefined;
  if (!raw) throw ApiError.validation("invalid_body", "from is required (the project has no default_from)", "from");
  let parsed: Sender;
  try {
    parsed = parseDisplayAddress(raw);
  } catch {
    throw ApiError.validation("invalid_body", `from is not a valid address: ${raw}`, "from");
  }
  const domains = allowedDomains(project);
  const domain = domainOf(parsed.address);
  if (!domains.includes(domain)) {
    throw ApiError.permission("invalid_sender", `from must be an address on ${domains.join(", ")}`, "from");
  }
  const senders = allowedSenders(project);
  if (senders && !senders.includes(parsed.address)) {
    throw ApiError.permission("invalid_sender", `from must be one of ${senders.join(", ")}`, "from");
  }
  return parsed;
}

export interface NormalisedRecipient {
  address: string;
  name: string | null;
  kind: RecipientKind;
}

export interface NormalisedRecipients {
  to: NormalisedRecipient[];
  cc: NormalisedRecipient[];
  bcc: NormalisedRecipient[];
  all: NormalisedRecipient[];
}

function asList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Step 3: parse, lowercase and dedupe recipients across lists (first list wins). */
export function normaliseRecipients(input: { to: string | string[]; cc?: string | string[]; bcc?: string | string[] }): NormalisedRecipients {
  const seen = new Set<string>();
  const out: NormalisedRecipients = { to: [], cc: [], bcc: [], all: [] };
  for (const kind of ["to", "cc", "bcc"] as const) {
    for (const raw of asList(input[kind])) {
      let p: { address: string; name: string | null };
      try {
        p = parseDisplayAddress(raw);
      } catch {
        throw ApiError.validation("invalid_body", `${kind} contains an invalid address: ${raw}`, kind);
      }
      if (seen.has(p.address)) continue;
      seen.add(p.address);
      const r = { address: p.address, name: p.name, kind };
      out[kind].push(r);
      out.all.push(r);
    }
  }
  if (out.to.length + out.cc.length + out.bcc.length === 0) {
    throw ApiError.validation("invalid_body", "at least one recipient is required", "to");
  }
  if (out.all.length > MAX_RECIPIENTS) {
    throw ApiError.validation("too_many_recipients", `at most ${MAX_RECIPIENTS} recipients (to + cc + bcc) per email`, "to");
  }
  return out;
}

const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Step 5: custom header checks (mirrors the binding's E_HEADER* rules so we fail before queueing). */
export function validateHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const enc = new TextEncoder();
  let total = 0;
  let nonX = 0;
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!HEADER_NAME_RE.test(name)) {
      throw ApiError.validation("invalid_header", `invalid header name: ${name}`, `headers.${name}`);
    }
    if (RESERVED_HEADERS.has(lower)) {
      const field = HEADER_FIELD_TO_PARAM[lower];
      const hint = field ? `use the "${field}" field instead` : "it is set by Flaresend";
      throw ApiError.validation("invalid_header", `header ${name} is not allowed; ${hint}`, `headers.${name}`);
    }
    if (/[\r\n]/.test(value)) {
      throw ApiError.validation("invalid_header", `header ${name} must not contain line breaks`, `headers.${name}`);
    }
    const bytes = enc.encode(value).length;
    if (bytes > MAX_HEADER_VALUE_BYTES) {
      throw ApiError.validation("invalid_header", `header ${name} is longer than ${MAX_HEADER_VALUE_BYTES} bytes`, `headers.${name}`);
    }
    if (!lower.startsWith("x-")) nonX++;
    total += enc.encode(name).length + bytes + 4; // "name: value\r\n"
  }
  if (nonX > MAX_NON_X_HEADERS) {
    throw ApiError.validation("invalid_header", `at most ${MAX_NON_X_HEADERS} custom headers that do not start with X-`, "headers");
  }
  if (total > MAX_HEADERS_TOTAL_BYTES) {
    throw ApiError.validation("invalid_header", "custom headers are larger than 16 KB in total", "headers");
  }
  return headers;
}

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isBase64(s: string): boolean {
  return BASE64_RE.test(s.replace(/\s+/g, ""));
}

/** Step 7 (attachments part): base64 content and inline contentId. */
export function validateAttachments(atts: Attachment[] | undefined): Attachment[] {
  if (!atts) return [];
  atts.forEach((a, i) => {
    if (!isBase64(a.content)) {
      throw ApiError.validation("invalid_attachment", `attachments[${i}].content must be base64`, `attachments.${i}.content`);
    }
    if (a.disposition === "inline" && !a.contentId) {
      throw ApiError.validation("invalid_attachment", `attachments[${i}] is inline and needs a contentId`, `attachments.${i}.contentId`);
    }
    if (/[\r\n"]/.test(a.filename)) {
      throw ApiError.validation("invalid_attachment", `attachments[${i}].filename contains invalid characters`, `attachments.${i}.filename`);
    }
  });
  return atts.map((a) => ({ ...a, content: a.content.replace(/\s+/g, "") }));
}

/** Step 7 (size part). */
export function checkPayloadSize(body: { html?: string; text?: string; attachments?: Attachment[] }): number {
  const size = new TextEncoder().encode(JSON.stringify(body)).length;
  if (size > MAX_PAYLOAD_BYTES) {
    throw ApiError.validation("payload_too_large", `email is ${size} bytes; the limit is ${MAX_PAYLOAD_BYTES} bytes (5 MiB)`);
  }
  return size;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function textPreview(text: string | undefined, html: string | undefined): string | null {
  const src = text?.trim() ? text.replace(/\s+/g, " ").trim() : html ? stripHtml(html) : "";
  return src ? src.slice(0, 200) : null;
}

/** Phase 3: scheduledAt must be in the future and at most 30 days ahead. */
export const MAX_SCHEDULE_MS = 30 * 24 * 3600 * 1000;
export function validateSchedule(scheduledAt: string | undefined, now = Date.now()): Date | null {
  if (!scheduledAt) return null;
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) throw ApiError.validation("invalid_schedule", "scheduledAt is not a valid date", "scheduledAt");
  if (d.getTime() <= now) throw ApiError.validation("invalid_schedule", "scheduledAt must be in the future", "scheduledAt");
  if (d.getTime() - now > MAX_SCHEDULE_MS) {
    throw ApiError.validation("invalid_schedule", "scheduledAt must be at most 30 days ahead", "scheduledAt");
  }
  return d;
}

import { describe, expect, it } from "vitest";
import {
  checkPayloadSize, isBase64, normaliseRecipients, resolveSender, stripHtml, textPreview, validateAttachments,
  validateHeaders, validateSchedule,
} from "../../src/core/validate";
import type { ProjectRow } from "../../src/db/projects";
import { ApiError } from "../../src/http/errors";

const project = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: "proj_1", slug: "p", name: "P", default_from: "Acme <hello@acme.com>", allowed_domains: '["acme.com","send.acme.com"]',
  allowed_senders: null, domain_senders: null, rpc_enabled: 1, daily_limit: 5000, track_opens: 0, track_clicks: 0, broadcasts_enabled: 0,
  created_at: "", updated_at: "", disabled_at: null, ...over,
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiError ? `${e.status}:${e.code}` : String(e);
  }
  return undefined;
}

describe("resolveSender", () => {
  it("falls back to default_from", () => {
    expect(resolveSender(undefined, project())).toEqual({ address: "hello@acme.com", name: "Acme" });
  });
  it("accepts any address on an allowed domain", () => {
    expect(resolveSender("Team <Team@Send.Acme.com>", project()).address).toBe("team@send.acme.com");
  });
  it("rejects a domain not on the list with 403 invalid_sender", () => {
    expect(codeOf(() => resolveSender("x@evil.com", project()))).toBe("403:invalid_sender");
    expect(codeOf(() => resolveSender("x@notacme.com", project()))).toBe("403:invalid_sender");
  });
  it("enforces allowed_senders when set", () => {
    const p = project({ allowed_senders: '["hello@acme.com"]' });
    expect(resolveSender("hello@acme.com", p).address).toBe("hello@acme.com");
    expect(codeOf(() => resolveSender("other@acme.com", p))).toBe("403:invalid_sender");
  });
  it("requires from when there is no default", () => {
    expect(codeOf(() => resolveSender(undefined, project({ default_from: null })))).toBe("400:invalid_body");
  });
  it("rejects an unparseable from", () => {
    expect(codeOf(() => resolveSender("not an address", project()))).toBe("400:invalid_body");
  });
});

describe("normaliseRecipients", () => {
  it("lowercases and dedupes across lists, first list wins", () => {
    const r = normaliseRecipients({ to: ["A@x.com", "b@x.com"], cc: ["a@x.com", "C@x.com"], bcc: "b@X.com" });
    expect(r.to.map((x) => x.address)).toEqual(["a@x.com", "b@x.com"]);
    expect(r.cc.map((x) => x.address)).toEqual(["c@x.com"]);
    expect(r.bcc).toEqual([]);
    expect(r.all).toHaveLength(3);
  });
  it("keeps display names", () => {
    expect(normaliseRecipients({ to: "Jane <jane@x.com>" }).to[0]).toEqual({ address: "jane@x.com", name: "Jane", kind: "to" });
  });
  it("caps total recipients at 50", () => {
    const to = Array.from({ length: 30 }, (_, i) => `t${i}@x.com`);
    const cc = Array.from({ length: 21 }, (_, i) => `c${i}@x.com`);
    expect(codeOf(() => normaliseRecipients({ to, cc }))).toBe("400:too_many_recipients");
    expect(normaliseRecipients({ to, cc: cc.slice(0, 20) }).all).toHaveLength(50);
  });
  it("rejects invalid addresses with the list name as param", () => {
    try {
      normaliseRecipients({ to: "a@x.com", cc: ["bad"] });
      expect.unreachable();
    } catch (e) {
      expect((e as ApiError).param).toBe("cc");
    }
  });
});

describe("validateHeaders", () => {
  it.each(["From", "to", "Subject", "Reply-To", "Message-ID", "Content-Type", "MIME-Version", "Date", "Bcc", "Cc"])(
    "rejects reserved header %s",
    (h) => expect(codeOf(() => validateHeaders({ [h]: "x" }))).toBe("400:invalid_header"),
  );
  it("points at the API field in the message", () => {
    try {
      validateHeaders({ "Reply-To": "x" });
    } catch (e) {
      expect((e as Error).message).toContain('"replyTo"');
    }
  });
  it("rejects values over 2048 bytes", () => {
    expect(codeOf(() => validateHeaders({ "X-Big": "x".repeat(2049) }))).toBe("400:invalid_header");
    expect(validateHeaders({ "X-Ok": "x".repeat(2048) })).toBeTruthy();
  });
  it("rejects more than 20 non-X- headers but allows many X- headers", () => {
    const nonX = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`List-H${i}`, "v"]));
    expect(codeOf(() => validateHeaders(nonX))).toBe("400:invalid_header");
    const x = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`X-H${i}`, "v"]));
    expect(validateHeaders(x)).toBeTruthy();
  });
  it("rejects total over 16 KB", () => {
    const h = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`X-H${i}`, "v".repeat(2000)]));
    expect(codeOf(() => validateHeaders(h))).toBe("400:invalid_header");
  });
  it("rejects CR/LF injection", () => {
    expect(codeOf(() => validateHeaders({ "X-A": "a\r\nBcc: x@y.com" }))).toBe("400:invalid_header");
  });
});

describe("attachments and size", () => {
  it("validates base64", () => {
    expect(isBase64("aGVsbG8=")).toBe(true);
    expect(isBase64("aGVsbG8")).toBe(false);
    expect(isBase64("not base64!")).toBe(false);
    expect(codeOf(() => validateAttachments([{ filename: "a.txt", content: "!!", disposition: "attachment" }]))).toBe("400:invalid_attachment");
  });
  it("requires contentId for inline", () => {
    expect(codeOf(() => validateAttachments([{ filename: "a.png", content: "aGVsbG8=", disposition: "inline" }]))).toBe("400:invalid_attachment");
    expect(validateAttachments([{ filename: "a.png", content: "aGVs\nbG8=", disposition: "inline", contentId: "logo" }])[0]!.content).toBe("aGVsbG8=");
  });
  it("rejects payloads over 5 MiB", () => {
    expect(codeOf(() => checkPayloadSize({ html: "x".repeat(5 * 1024 * 1024) }))).toBe("400:payload_too_large");
    expect(checkPayloadSize({ html: "x".repeat(1000) })).toBeLessThan(2000);
  });
});

describe("previews and schedules", () => {
  it("builds a text preview from text or stripped html", () => {
    expect(textPreview("  hello\n world ", "<p>x</p>")).toBe("hello world");
    expect(textPreview(undefined, "<style>p{}</style><p>Hi &amp; <b>bye</b></p>")).toBe("Hi & bye");
    expect(textPreview(undefined, undefined)).toBeNull();
    expect(textPreview("x".repeat(500), undefined)).toHaveLength(200);
    expect(stripHtml("<a href='x'>link</a>")).toBe("link");
    expect(stripHtml("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });
  it("validates scheduledAt", () => {
    const now = Date.parse("2026-09-25T00:00:00Z");
    expect(codeOf(() => validateSchedule("2026-09-24T00:00:00Z", now))).toBe("400:invalid_schedule");
    expect(codeOf(() => validateSchedule("2026-10-26T00:00:00Z", now))).toBe("400:invalid_schedule");
    expect(validateSchedule("2026-09-26T00:00:00Z", now)?.toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(validateSchedule(undefined, now)).toBeNull();
  });
});

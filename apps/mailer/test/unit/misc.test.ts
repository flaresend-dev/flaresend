import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@flaresend/client/webhooks";
import { canonicalJson } from "../../src/core/idempotency";
import { generateApiKey, hashKey, looksLikeApiKey, timingSafeEqual } from "../../src/core/keys";
import { randomBase62 } from "../../src/core/ids";
import { injectPixel, openToken, rewriteLinks, shouldTrackUrl } from "../../src/core/tracking";
import { backoffSeconds, classifySendError, errorCode } from "../../src/queue/send-consumer";
import { decodeCursor, encodeCursor, paginate } from "../../src/db/client";
import { toEmailRecord } from "../../src/db/emails";
import { buildWebhookPayload, retryDelayFor, webhookMatches } from "../../src/webhooks/deliver";
import { signatureHeader } from "../../src/webhooks/sign";
import { matchSubdomain, zoneCandidates } from "../../src/core/domains";
import { buildMessage } from "../../src/core/provider";

describe("keys", () => {
  it("generates fs_live_/fs_test_ keys with a 12-char prefix and sha256 hash", async () => {
    const k = await generateApiKey("live");
    expect(k.key).toMatch(/^fs_live_[0-9A-Za-z]{32}$/);
    expect(k.prefix).toBe(k.key.slice(0, 12));
    expect(k.hash).toBe(await hashKey(k.key));
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(looksLikeApiKey(k.key)).toBe(true);
    expect((await generateApiKey("test")).key.startsWith("fs_test_")).toBe(true);
  });
  it("timingSafeEqual", async () => {
    expect(await timingSafeEqual("abc", "abc")).toBe(true);
    expect(await timingSafeEqual("abc", "abd")).toBe(false);
    expect(await timingSafeEqual("abc", "abcd")).toBe(false);
  });
  it("randomBase62 has the right length and alphabet", () => {
    expect(randomBase62(40)).toMatch(/^[0-9A-Za-z]{40}$/);
  });
});

describe("canonicalJson", () => {
  it("sorts keys recursively and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
  });
});

describe("cursors", () => {
  it("round-trips", () => {
    const c = encodeCursor("2026-09-25T10:00:00.000Z", "email_01X");
    expect(c).not.toMatch(/[+/=]/);
    expect(decodeCursor(c)).toEqual({ createdAt: "2026-09-25T10:00:00.000Z", id: "email_01X" });
    expect(decodeCursor("garbage!!")).toBeNull();
  });
  it("paginate returns a cursor only when there are more rows", () => {
    const rows = [1, 2, 3].map((i) => ({ created_at: `t${i}`, id: `id${i}` }));
    expect(paginate(rows, 3).nextCursor).toBeNull();
    const p = paginate(rows, 2);
    expect(p.rows).toHaveLength(2);
    expect(decodeCursor(p.nextCursor)).toEqual({ createdAt: "t2", id: "id2" });
  });
});

describe("toEmailRecord", () => {
  it("maps a row to the API shape", () => {
    const rec = toEmailRecord(
      {
        id: "email_1", project_id: "proj_1", api_key_id: null, mode: "live", source: "rpc", from_address: "a@b.co", from_name: "A",
        reply_to: null, to_addresses: '["x@y.co"]', cc_addresses: "[]", bcc_addresses: '["z@y.co"]', subject: "S", text_preview: "p",
        has_html: 1, has_text: 0, attachment_count: 0, size_bytes: 10, tags: '{"k":"v"}', template_name: null, template_version: null,
        idempotency_key: null, body_hash: null, status: "failed", cloudflare_message_id: null, last_error_code: "E_X",
        last_error_message: "boom", attempts: 2, created_at: "c", queued_at: "q", sent_at: null, delivered_at: null, failed_at: "f",
        scheduled_at: null, enqueued_at: null, track_opens: 1, track_clicks: 0, open_token: null, opened_at: null, first_clicked_at: null,
      },
      [{ id: "r", email_id: "email_1", address: "x@y.co", kind: "to", status: "failed", provider: null, smtp_status: null, smtp_response: null, delivery_ms: null, bounce_type: null, last_event_at: null }],
      [{ id: "evt_1", email_id: "email_1", project_id: "proj_1", recipient: null, type: "email.failed", cloudflare_event_id: null, data: '{"code":"E_X"}', created_at: "c" }],
    );
    expect(rec).toMatchObject({
      to: ["x@y.co"], bcc: ["z@y.co"], tags: { k: "v" }, lastError: { code: "E_X", message: "boom" }, trackOpens: true, trackClicks: false,
      recipients: [{ address: "x@y.co", kind: "to", status: "failed" }], events: [{ type: "email.failed", data: { code: "E_X" } }],
    });
  });
});

describe("tracking", () => {
  const base = "https://mailer.example.com";
  it("rewrites http(s) anchors only", () => {
    let n = 0;
    const html = `<a href="https://a.com/x?y=1&amp;z=2">A</a> <a class='b' href='http://b.com'>B</a>
      <a href="mailto:x@y.com">m</a> <a href="#top">t</a> <a href="tel:1">p</a> <a href="https://x.com/{{id}}">v</a>
      <img src="https://img.com/a.png"> <a href="${base}/u/tok">unsub</a>`;
    const r = rewriteLinks(html, base, () => `tok${n++}`);
    expect(r.links).toEqual([{ id: "tok0", url: "https://a.com/x?y=1&z=2" }, { id: "tok1", url: "http://b.com" }]);
    expect(r.html).toContain(`href="${base}/t/c/tok0"`);
    expect(r.html).toContain(`href='${base}/t/c/tok1'`);
    expect(r.html).toContain('href="mailto:x@y.com"');
    expect(r.html).toContain('src="https://img.com/a.png"');
    expect(r.html).toContain(`${base}/u/tok`);
    expect(shouldTrackUrl("ftp://x", base)).toBe(false);
    expect(rewriteLinks('<a href="https://a.com/?x=&amp;#38;">A</a>', base, () => "single").links[0]?.url)
      .toBe("https://a.com/?x=&#38;");
  });
  it("injects the pixel before </body> or at the end", () => {
    expect(injectPixel("<html><body>x</body></html>", "P")).toBe('<html><body>x<img src="P" width="1" height="1" alt="" style="display:none"></body></html>');
    expect(injectPixel("x", "P").startsWith("x<img")).toBe(true);
  });
  it("open tokens are deterministic 22-char base64url", async () => {
    const t = await openToken("s", "email_1");
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await openToken("s", "email_1")).toBe(t);
    expect(await openToken("s", "email_2")).not.toBe(t);
  });
});

describe("send error classification", () => {
  it("reads the code from .code or the message", () => {
    expect(errorCode(Object.assign(new Error("x"), { code: "E_SENDER_NOT_VERIFIED" }))).toBe("E_SENDER_NOT_VERIFIED");
    expect(errorCode(new Error("E_RATE_LIMIT_EXCEEDED: slow down"))).toBe("E_RATE_LIMIT_EXCEEDED");
    expect(errorCode(new Error("network down"))).toBeNull();
  });
  it("classifies send errors as retry or fail", () => {
    for (const c of ["E_RATE_LIMIT_EXCEEDED", "E_INTERNAL_SERVER_ERROR", "E_DELIVERY_FAILED", null]) {
      expect(classifySendError(c, 1).kind).toBe("retry");
    }
    expect(classifySendError("E_DAILY_LIMIT_EXCEEDED", 1)).toEqual({ kind: "retry", delaySeconds: 3600 });
    expect(classifySendError("E_SENDER_NOT_VERIFIED", 1)).toEqual({ kind: "fail", status: "failed" });
    expect(classifySendError("E_HEADER_TOO_LONG", 1)).toEqual({ kind: "fail", status: "failed" });
    expect(classifySendError("E_RECIPIENT_SUPPRESSED", 1)).toEqual({ kind: "fail", status: "rejected" });
  });
  it("backoff is min(2^n*15, 3600) plus up to 20% jitter", () => {
    expect(backoffSeconds(1, () => 0)).toBe(30);
    expect(backoffSeconds(3, () => 0)).toBe(120);
    expect(backoffSeconds(3, () => 1)).toBe(144);
    expect(backoffSeconds(10, () => 0)).toBe(3600);
    expect(backoffSeconds(10, () => 1)).toBe(4320);
  });
});

describe("webhooks", () => {
  it("signatures verify with @flaresend/client", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "email.delivered" });
    const header = await signatureHeader("whsec_abc", body);
    expect(await verifyWebhookSignature("whsec_abc", header, body)).toBe(true);
    expect(await verifyWebhookSignature("whsec_other", header, body)).toBe(false);
    expect(await verifyWebhookSignature("whsec_abc", header, body + " ")).toBe(false);
    const old = await signatureHeader("whsec_abc", body, Math.floor(Date.now() / 1000) - 3600);
    expect(await verifyWebhookSignature("whsec_abc", old, body)).toBe(false);
  });
  it("retry schedule is 30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(retryDelayFor)).toEqual([30, 120, 600, 1800, 3600, 10800, 21600, 43200, 43200]);
  });
  it("matches event filters", () => {
    expect(webhookMatches({ events: '["*"]' }, "email.sent")).toBe(true);
    expect(webhookMatches({ events: '["email.bounced"]' }, "email.sent")).toBe(false);
    expect(webhookMatches({ events: '["email.bounced","email.sent"]' }, "email.sent")).toBe(true);
  });
  it("builds the documented payload", () => {
    const p = buildWebhookPayload(
      { id: "evt_1", type: "email.delivered", recipient: "a@b.co", data: '{"delivery":{"status":"delivered"}}', created_at: "t" },
      { id: "email_1", from_address: "x@y.co", subject: "S", tags: '{"k":"v"}' },
    );
    expect(p).toEqual({
      id: "evt_1", type: "email.delivered", createdAt: "t",
      data: { emailId: "email_1", recipient: "a@b.co", from: "x@y.co", subject: "S", tags: { k: "v" }, delivery: { status: "delivered" } },
    });
  });
});

describe("domains", () => {
  it("builds zone candidates", () => {
    expect(zoneCandidates("send.acme.com")).toEqual(["send.acme.com", "acme.com"]);
  });
  it("matches exact and wildcard sending subdomains", () => {
    const subs = [{ name: "acme.com", enabled: true }, { name: "*.mail.x.com", enabled: false }];
    expect(matchSubdomain("acme.com", subs)?.enabled).toBe(true);
    expect(matchSubdomain("a.mail.x.com", subs)?.name).toBe("*.mail.x.com");
    expect(matchSubdomain("other.com", subs)).toBeNull();
  });
});

describe("provider message", () => {
  it("uses {email,name}, camelCase replyTo, raw bytes and omits empty lists", () => {
    const m = buildMessage(
      {
        from: "a@b.co", fromName: "A", replyTo: null, to: ["x@y.co"], cc: [], bcc: [{ email: "z@y.co", name: "Z" }], subject: "S",
        html: "<p>h</p>", text: null, headers: { "X-A": "1" },
        attachments: [{ filename: "f.pdf", content: "aGVsbG8=", disposition: "attachment" }],
      },
      "email_1",
    ) as any;
    expect(m.from).toEqual({ email: "a@b.co", name: "A" });
    expect(m.cc).toBeUndefined();
    expect(m.replyTo).toBeUndefined();
    expect(m.text).toBeUndefined();
    expect(m.headers).toEqual({ "X-A": "1", "X-Flaresend-Id": "email_1" });
    expect(m.attachments[0].type).toBe("application/pdf");
    expect(new TextDecoder().decode(m.attachments[0].content)).toBe("hello");
  });
});

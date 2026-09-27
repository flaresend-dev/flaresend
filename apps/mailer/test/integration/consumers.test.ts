import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index";
import { emailProvider } from "../../src/core/provider";
import { queueOps } from "../../src/queue/producer";
import { sendEmail } from "../../src/core/send";
import { processWebhookMessage } from "../../src/queue/webhooks-consumer";
import { createWebhook } from "../../src/core/webhooks";
import { ADMIN_KEY, call, cfEvent, env, json, makeBatch, makeMessage, setupProject, type TestProject } from "../helpers";

const providerSend = vi.spyOn(emailProvider, "send");
const webhookEnqueue = vi.spyOn(queueOps, "webhooks").mockResolvedValue();
vi.spyOn(queueOps, "send").mockResolvedValue();
vi.spyOn(queueOps, "sendBatch").mockResolvedValue();

let p: TestProject;
beforeEach(async () => {
  providerSend.mockReset();
  webhookEnqueue.mockClear();
  await env.DB.prepare("DELETE FROM suppressions").run();
  p = await setupProject();
});

const basic = { from: "Acme <hello@acme.com>", to: ["a@example.com", "b@example.com"], subject: "Hi", html: "<p>Hi</p>" };

async function queued(input: Record<string, unknown> = basic): Promise<string> {
  return (await sendEmail(env, { project: p.project, mode: "live", source: "http", apiKeyId: null }, input)).id;
}

async function runSend(emailId: string, attempts = 1) {
  const msg = makeMessage({ kind: "send" as const, emailId, projectId: p.project.id, attempt: 0 }, attempts);
  await worker.queue(makeBatch("flaresend-send", [msg]), env);
  return msg;
}

async function runEvents(events: unknown[], attempts = 1) {
  const msgs = events.map((e) => makeMessage(e, attempts));
  await worker.queue(makeBatch("flaresend-events", msgs), env);
  return msgs;
}

const email = (id: string) => env.DB.prepare("SELECT * FROM emails WHERE id = ?").bind(id).first<any>();
const recipients = async (id: string) =>
  (await env.DB.prepare("SELECT * FROM email_recipients WHERE email_id = ? ORDER BY address").bind(id).all<any>()).results;
const events = async (id: string) =>
  (await env.DB.prepare("SELECT type FROM email_events WHERE email_id = ? ORDER BY created_at, rowid").bind(id).all<any>()).results.map((e) => e.type);

describe("send consumer", () => {
  it("success: status sent, message id stored, recipients sent, event added", async () => {
    providerSend.mockResolvedValue({ messageId: "cf-msg-1" });
    const id = await queued();
    const msg = await runSend(id);
    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();
    const e = await email(id);
    expect(e).toMatchObject({ status: "sent", cloudflare_message_id: "cf-msg-1", attempts: 1 });
    expect(e.sent_at).toBeTruthy();
    expect((await recipients(id)).map((r) => r.status)).toEqual(["sent", "sent"]);
    expect(await events(id)).toEqual(["email.queued", "email.sent"]);
    const [, payload, emailId] = providerSend.mock.calls[0]!;
    expect(emailId).toBe(id);
    expect(payload.to).toEqual(["a@example.com", "b@example.com"]);
  });

  it("retryable error: back to queued, email.retrying event, retry() with backoff", async () => {
    providerSend.mockRejectedValue(Object.assign(new Error("slow down"), { code: "E_RATE_LIMIT_EXCEEDED" }));
    const id = await queued();
    const msg = await runSend(id, 2);
    expect(msg.ack).not.toHaveBeenCalled();
    const delay = msg.retry.mock.calls[0]![0]!.delaySeconds!;
    expect(delay).toBeGreaterThanOrEqual(60);
    expect(delay).toBeLessThanOrEqual(72);
    expect(await email(id)).toMatchObject({ status: "queued", last_error_code: "E_RATE_LIMIT_EXCEEDED" });
    expect(await events(id)).toEqual(["email.queued", "email.retrying"]);
  });

  it("network error without a code is retried; E_DAILY_LIMIT_EXCEEDED waits an hour", async () => {
    providerSend.mockRejectedValueOnce(new Error("socket hang up"));
    const id = await queued();
    expect((await runSend(id)).retry).toHaveBeenCalled();
    providerSend.mockRejectedValueOnce(Object.assign(new Error("quota"), { code: "E_DAILY_LIMIT_EXCEEDED" }));
    const msg = await runSend(id, 2);
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 3600 });
  });

  it("E_SENDER_NOT_VERIFIED fails without a retry loop", async () => {
    providerSend.mockRejectedValue(Object.assign(new Error("sender domain not verified"), { code: "E_SENDER_NOT_VERIFIED" }));
    const id = await queued();
    const msg = await runSend(id);
    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();
    const e = await email(id);
    expect(e).toMatchObject({ status: "failed", last_error_code: "E_SENDER_NOT_VERIFIED" });
    expect(e.failed_at).toBeTruthy();
    expect((await recipients(id)).map((r) => r.status)).toEqual(["failed", "failed"]);
    expect(await events(id)).toEqual(["email.queued", "email.failed"]);
  });

  it("E_RECIPIENT_SUPPRESSED -> rejected and suppression rows", async () => {
    providerSend.mockRejectedValue(Object.assign(new Error("suppressed"), { code: "E_RECIPIENT_SUPPRESSED" }));
    const id = await queued({ ...basic, to: "sup1@example.com" });
    await runSend(id);
    expect((await email(id)).status).toBe("rejected");
    const s = await env.DB.prepare("SELECT reason, source_email_id FROM suppressions WHERE address = 'sup1@example.com'").first<any>();
    expect(s).toEqual({ reason: "hard_bounce", source_email_id: id });
  });

  it("skips canceled or already-sent emails, and never double-sends", async () => {
    providerSend.mockResolvedValue({ messageId: "cf-once" });
    const id = await queued();
    await runSend(id);
    const again = await runSend(id);
    expect(again.ack).toHaveBeenCalled();
    expect(providerSend).toHaveBeenCalledTimes(1);
  });

  it("a scheduled email that is not due yet is retried with the remaining delay", async () => {
    const id = await queued({ ...basic, scheduledAt: new Date(Date.now() + 3600_000).toISOString() });
    const msg = await runSend(id);
    expect(providerSend).not.toHaveBeenCalled();
    const delay = msg.retry.mock.calls[0]![0]!.delaySeconds!;
    expect(delay).toBeGreaterThan(3500);
    expect(delay).toBeLessThanOrEqual(3600);
  });

  it("missing payload -> failed payload_missing", async () => {
    const id = await queued();
    await env.PAYLOADS.delete(`payloads/${id}.json`);
    const msg = await runSend(id);
    expect(msg.ack).toHaveBeenCalled();
    expect(await email(id)).toMatchObject({ status: "failed", last_error_code: "payload_missing" });
  });

  it("replays orphan events once the messageId is known", async () => {
    const id = await queued({ ...basic, to: "orphan@example.com" });
    const ev = cfEvent("delivered", "cf-orphan", "orphan@example.com");
    // Event arrives before the send finished: retried, then parked after 6 attempts.
    const [m1] = await runEvents([ev], 1);
    expect(m1!.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
    const [m6] = await runEvents([ev], 6);
    expect(m6!.ack).toHaveBeenCalled();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orphan_events WHERE cloudflare_message_id = 'cf-orphan'").first("n")).toBe(1);

    providerSend.mockResolvedValue({ messageId: "cf-orphan" });
    await runSend(id);
    expect((await email(id)).status).toBe("delivered");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orphan_events WHERE cloudflare_message_id = 'cf-orphan'").first("n")).toBe(0);
  });

  it("applies open/click tracking when enabled and keeps the original html", async () => {
    providerSend.mockResolvedValue({ messageId: "cf-track" });
    const id = await queued({ ...basic, to: "t@example.com", html: '<html><body><a href="https://acme.com/x">x</a></body></html>', trackOpens: true, trackClicks: true });
    await runSend(id);
    const sentHtml = providerSend.mock.calls[0]![3] as string;
    expect(sentHtml).toMatch(/\/t\/c\/[0-9A-Za-z]{16}/);
    expect(sentHtml).toMatch(/\/t\/o\/[A-Za-z0-9_-]{22}/);
    const content = await json(call("GET", `/v1/emails/${id}/content`, { key: p.liveKey }));
    expect(content.html).toBe('<html><body><a href="https://acme.com/x">x</a></body></html>');
    expect(content.trackedHtml).toBe(sentHtml);
  });
});

describe("events consumer with the six documented payloads", () => {
  async function sentEmail(messageId: string, to: string[] = ["user@example.net"]): Promise<string> {
    providerSend.mockResolvedValueOnce({ messageId });
    const id = await queued({ ...basic, to });
    await runSend(id);
    return id;
  }

  it.each([
    ["delivered", "delivered", "delivered"],
    ["deferred", "deferred", "deferred"],
    ["bounced", "bounced", "bounced"],
    ["failed", "failed", "failed"],
    ["rejected", "rejected", "rejected"],
    ["complained", "complained", "complained"],
  ] as const)("%s -> recipient %s, email %s", async (fixture, rcptStatus, emailStatus) => {
    const mid = `cf-${fixture}-${crypto.randomUUID()}`;
    const id = await sentEmail(mid);
    const [msg] = await runEvents([cfEvent(fixture, mid, "user@example.net")]);
    expect(msg!.ack).toHaveBeenCalled();
    const [r] = await recipients(id);
    expect(r.status).toBe(rcptStatus);
    expect((await email(id)).status).toBe(emailStatus);
    expect(await events(id)).toContain(`email.${fixture}`);
  });

  it("stores SMTP details on the recipient and the timeline", async () => {
    const id = await sentEmail("cf-smtp");
    await runEvents([cfEvent("delivered", "cf-smtp", "user@example.net", { timestamp: "2026-09-25T10:00:00.000Z" })]);
    const [r] = await recipients(id);
    expect(r).toMatchObject({ provider: "gmail", smtp_status: "2.0.0", smtp_response: "250 2.0.0 OK 1714820445 a1b2c3 - gsmtp", delivery_ms: 1234, last_event_at: "2026-09-25T10:00:00.000Z" });
    const e = await email(id);
    expect(e.delivered_at).toBe("2026-09-25T10:00:00.000Z");
    const rec = await json(call("GET", `/v1/emails/${id}`, { key: p.liveKey }));
    const delivered = rec.events.find((x: any) => x.type === "email.delivered");
    expect(delivered).toMatchObject({ recipient: "user@example.net", data: { delivery: { status: "delivered", provider: "gmail" } } });
  });

  it("delivered only when every recipient is delivered", async () => {
    const id = await sentEmail("cf-two", ["x@example.com", "y@example.com"]);
    await runEvents([cfEvent("delivered", "cf-two", "x@example.com")]);
    expect((await email(id)).status).toBe("sent");
    await runEvents([cfEvent("delivered", "cf-two", "Y@Example.com")]);
    expect((await email(id)).status).toBe("delivered");
  });

  it("dedupes a repeated eventId", async () => {
    const id = await sentEmail("cf-dup");
    const ev = cfEvent("deferred", "cf-dup", "user@example.net", { eventId: "dup-1" });
    await runEvents([ev]);
    const [msg] = await runEvents([ev]);
    expect(msg!.ack).toHaveBeenCalled();
    expect((await events(id)).filter((t) => t === "email.deferred")).toHaveLength(1);
  });

  it("never downgrades a terminal recipient (out-of-order deferred after delivered)", async () => {
    const id = await sentEmail("cf-order");
    await runEvents([cfEvent("delivered", "cf-order", "user@example.net")]);
    await runEvents([cfEvent("deferred", "cf-order", "user@example.net")]);
    expect((await recipients(id))[0].status).toBe("delivered");
    expect((await email(id)).status).toBe("delivered");
    expect(await events(id)).toContain("email.deferred");
  });

  it("a complaint after delivery keeps delivered_at and sets complained", async () => {
    const id = await sentEmail("cf-comp");
    await runEvents([cfEvent("delivered", "cf-comp", "user@example.net")]);
    await runEvents([cfEvent("complained", "cf-comp", "user@example.net")]);
    const e = await email(id);
    expect(e.status).toBe("complained");
    expect(e.delivered_at).toBeTruthy();
    const s = await env.DB.prepare("SELECT reason FROM suppressions WHERE address = 'user@example.net'").first("reason");
    expect(s).toBe("complaint");
    await env.DB.prepare("DELETE FROM suppressions WHERE address = 'user@example.net'").run();
  });

  it("hard bounce upserts a suppression; soft (deferred) does not", async () => {
    const id = await sentEmail("cf-hard", ["hb@example.com"]);
    await runEvents([cfEvent("deferred", "cf-hard", "hb@example.com")]);
    expect(await env.DB.prepare("SELECT 1 FROM suppressions WHERE address = 'hb@example.com'").first()).toBeNull();
    await runEvents([cfEvent("bounced", "cf-hard", "hb@example.com")]);
    expect(await env.DB.prepare("SELECT reason, source_email_id FROM suppressions WHERE address = 'hb@example.com'").first()).toEqual({ reason: "hard_bounce", source_email_id: id });
    // next send to that address is rejected up front
    expect((await call("POST", "/v1/emails", { key: p.liveKey, body: { ...basic, to: "hb@example.com" } })).status).toBe(422);
  });

  it("creates a recipient row for an unknown recipient instead of losing the event", async () => {
    const id = await sentEmail("cf-unknown");
    await runEvents([cfEvent("delivered", "cf-unknown", "stranger@example.com")]);
    expect((await recipients(id)).map((r) => r.address)).toContain("stranger@example.com");
  });

  it("acks messages that are not Cloudflare email events", async () => {
    const [msg] = await runEvents([{ type: "something.else" }]);
    expect(msg!.ack).toHaveBeenCalled();
  });

  it("POST /v1/admin/dev/events runs the same logic", async () => {
    const id = await sentEmail("cf-dev");
    const r = await json(call("POST", "/v1/admin/dev/events", { key: ADMIN_KEY, body: cfEvent("delivered", "cf-dev", "user@example.net") }));
    expect(r).toMatchObject({ ok: true, result: { kind: "processed", emailId: id, status: "delivered" } });
  });
});

describe("webhooks", () => {
  it("fans out matching events and delivers with a verifiable signature", async () => {
    const hook = await createWebhook(env, p.project.id, { url: "https://hooks.example.com/in", events: ["email.delivered"] });
    providerSend.mockResolvedValueOnce({ messageId: "cf-wh" });
    const id = await queued({ ...basic, to: "user@example.net", tags: { plan: "pro" } });
    await runSend(id);
    expect(webhookEnqueue).not.toHaveBeenCalled(); // email.sent is not subscribed
    await runEvents([cfEvent("delivered", "cf-wh", "user@example.net")]);
    expect(webhookEnqueue).toHaveBeenCalledTimes(1);
    const deliveryId = webhookEnqueue.mock.calls[0]![1][0]!;

    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const msg = makeMessage({ kind: "webhook" as const, deliveryId });
    await processWebhookMessage(msg, env, fetchImpl as unknown as typeof fetch);
    expect(msg.ack).toHaveBeenCalled();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/in");
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ type: "email.delivered", data: { emailId: id, recipient: "user@example.net", from: "hello@acme.com", subject: "Hi", tags: { plan: "pro" }, delivery: { status: "delivered" } } });
    const { verifyWebhookSignature } = await import("@flaresend/client/webhooks");
    expect(await verifyWebhookSignature(hook.secret!, headers["Flaresend-Signature"]!, init.body as string)).toBe(true);
    expect(headers["Flaresend-Event-Id"]).toBe(body.id);
    expect(headers["Flaresend-Delivery-Id"]).toBe(deliveryId);
    const d = await env.DB.prepare("SELECT status, attempt, response_code FROM webhook_deliveries WHERE id = ?").bind(deliveryId).first();
    expect(d).toEqual({ status: "success", attempt: 1, response_code: 200 });
  });

  it("a failing endpoint is retried on the schedule and the DLQ marks it failed", async () => {
    await createWebhook(env, p.project.id, { url: "https://hooks.example.com/fail" });
    providerSend.mockResolvedValueOnce({ messageId: "cf-wh-fail" });
    const id = await queued({ ...basic, to: "user@example.net" });
    await runSend(id);
    const deliveryId = webhookEnqueue.mock.calls.at(-1)![1][0]!; // email.sent
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      const msg = makeMessage({ kind: "webhook" as const, deliveryId }, i + 1);
      await processWebhookMessage(msg, env, fetchImpl as unknown as typeof fetch);
      delays.push(msg.retry.mock.calls[0]![0]!.delaySeconds!);
    }
    expect(delays).toEqual([30, 120, 600]);
    const d = await env.DB.prepare("SELECT status, attempt, response_code, response_body, next_attempt_at FROM webhook_deliveries WHERE id = ?").bind(deliveryId).first<any>();
    expect(d).toMatchObject({ status: "pending", attempt: 3, response_code: 500, response_body: "nope" });
    expect(d.next_attempt_at).toBeTruthy();

    await worker.queue(makeBatch("flaresend-dlq", [makeMessage({ kind: "webhook", deliveryId })]), env);
    expect(await env.DB.prepare("SELECT status FROM webhook_deliveries WHERE id = ?").bind(deliveryId).first("status")).toBe("failed");
  });

  it("timeouts are recorded as failures", async () => {
    await createWebhook(env, p.project.id, { url: "https://hooks.example.com/slow" });
    providerSend.mockResolvedValueOnce({ messageId: "cf-wh-slow" });
    await runSend(await queued({ ...basic, to: "user@example.net" }));
    const deliveryId = webhookEnqueue.mock.calls.at(-1)![1][0]!;
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const msg = makeMessage({ kind: "webhook" as const, deliveryId });
    await processWebhookMessage(msg, env, fetchImpl as unknown as typeof fetch);
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(await env.DB.prepare("SELECT response_body FROM webhook_deliveries WHERE id = ?").bind(deliveryId).first("response_body")).toBe("timeout after 10s");
  });
});

describe("DLQ", () => {
  it("marks a send that exhausted retries as failed max_retries_exhausted", async () => {
    const id = await queued();
    const msg = makeMessage({ kind: "send", emailId: id, projectId: p.project.id, attempt: 0 });
    await worker.queue(makeBatch("flaresend-dlq", [msg]), env);
    expect(msg.ack).toHaveBeenCalled();
    expect(await email(id)).toMatchObject({ status: "failed", last_error_code: "max_retries_exhausted" });
  });
});

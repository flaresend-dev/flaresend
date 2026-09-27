import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_KEY, call, env, json, setupProject, type TestProject } from "../helpers";
import { queueOps } from "../../src/queue/producer";

const enqueueSend = vi.spyOn(queueOps, "send").mockResolvedValue();
const enqueueSendBatch = vi.spyOn(queueOps, "sendBatch").mockResolvedValue();
vi.spyOn(queueOps, "webhooks").mockResolvedValue();

const basic = { from: "Acme <hello@acme.com>", to: "user@example.com", subject: "Welcome", html: "<p>Hi</p>", text: "Hi" };

let p: TestProject;
beforeEach(async () => {
  enqueueSend.mockClear();
  enqueueSendBatch.mockClear();
  p = await setupProject();
});

async function send(body: unknown, headers: Record<string, string> = {}, key = p.liveKey) {
  return call("POST", "/v1/emails", { key, body, headers });
}

describe("POST /v1/emails", () => {
  it("202, writes D1 + R2 and enqueues", async () => {
    const r = await send({ ...basic, cc: "Cc <CC@example.com>", tags: { plan: "pro" } });
    expect(r.status).toBe(202);
    const { id, status } = await json(r);
    expect(id).toMatch(/^email_/);
    expect(status).toBe("queued");

    const row = await env.DB.prepare("SELECT * FROM emails WHERE id = ?").bind(id).first<any>();
    expect(row).toMatchObject({ status: "queued", mode: "live", source: "http", from_address: "hello@acme.com", from_name: "Acme", subject: "Welcome", has_html: 1, has_text: 1, text_preview: "Hi" });
    const recipients = await env.DB.prepare("SELECT address, kind, status FROM email_recipients WHERE email_id = ? ORDER BY kind DESC").bind(id).all();
    expect(recipients.results).toEqual([
      { address: "user@example.com", kind: "to", status: "queued" },
      { address: "cc@example.com", kind: "cc", status: "queued" },
    ]);
    const obj = await env.PAYLOADS.get(`payloads/${id}.json`);
    expect(obj?.customMetadata?.projectId).toBe(p.project.id);
    const payload = (await obj!.json()) as any;
    expect(payload).toMatchObject({ from: "hello@acme.com", fromName: "Acme", to: ["user@example.com"], cc: [{ email: "cc@example.com", name: "Cc" }], html: "<p>Hi</p>" });
    expect(enqueueSend).toHaveBeenCalledWith(expect.anything(), { body: { kind: "send", emailId: id, projectId: p.project.id, attempt: 0 } });

    const rec = await json(call("GET", `/v1/emails/${id}`, { key: p.liveKey }));
    expect(rec).toMatchObject({ id, status: "queued", tags: { plan: "pro" }, cc: ["cc@example.com"] });
    expect(rec.events.map((e: any) => e.type)).toEqual(["email.queued"]);
  });

  it("uses the project default_from when from is omitted", async () => {
    const { id } = await json(send({ to: "u@example.com", subject: "s", text: "t" }));
    expect((await json(call("GET", `/v1/emails/${id}`, { key: p.liveKey }))).from).toBe("hello@acme.com");
  });

  it("403 invalid_sender for a from outside allowed_domains", async () => {
    const r = await send({ ...basic, from: "x@evil.com" });
    expect(r.status).toBe(403);
    expect((await json(r)).error).toMatchObject({ type: "permission_error", code: "invalid_sender", param: "from" });
    expect(enqueueSend).not.toHaveBeenCalled();
  });

  it("422 recipient_suppressed with the address in param", async () => {
    await call("POST", "/v1/admin/suppressions", { key: ADMIN_KEY, body: { address: "gone@example.com" } });
    const r = await send({ ...basic, to: ["ok@example.com"], bcc: "Gone@Example.com" });
    expect(r.status).toBe(422);
    expect((await json(r)).error).toMatchObject({ code: "recipient_suppressed", param: "gone@example.com" });
  });

  it.each([
    [{ ...basic, headers: { Subject: "x" } }, 400, "invalid_header"],
    [{ ...basic, to: Array.from({ length: 30 }, (_, i) => `t${i}@x.com`), cc: Array.from({ length: 21 }, (_, i) => `c${i}@x.com`) }, 400, "too_many_recipients"],
    [{ ...basic, html: "x".repeat(5 * 1024 * 1024 + 1) }, 400, "payload_too_large"],
    [{ ...basic, attachments: [{ filename: "a.txt", content: "***" }] }, 400, "invalid_attachment"],
    [{ ...basic, attachments: [{ filename: "a.png", content: "aGk=", disposition: "inline" }] }, 400, "invalid_attachment"],
    [{ to: "u@x.com", html: "x" }, 400, "invalid_body"],
    [{ ...basic, subject: undefined, text: "t" }, 400, "invalid_body"],
    [{ ...basic, template: "no-such-template", subject: undefined }, 404, "template_not_found"],
    [{ ...basic, scheduledAt: "2020-01-01T00:00:00Z" }, 400, "invalid_schedule"],
  ])("rejects %#", async (body, status, code) => {
    const r = await send(body);
    expect(r.status).toBe(status);
    expect((await json(r)).error.code).toBe(code);
  });

  it("idempotent replay returns 200 with the same id; different body -> 409", async () => {
    const h = { "Idempotency-Key": "order-123" };
    const first = await send(basic, h);
    expect(first.status).toBe(202);
    const a = await json(first);
    const second = await send(basic, h);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ id: a.id, status: "queued", idempotent: true });
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM emails WHERE project_id = ?").bind(p.project.id).first<{ n: number }>();
    expect(count?.n).toBe(1);
    expect(enqueueSend).toHaveBeenCalledTimes(1);

    const conflict = await send({ ...basic, subject: "Different" }, h);
    expect(conflict.status).toBe(409);
    expect((await json(conflict)).error.code).toBe("idempotency_payload_mismatch");
  });

  it("the body idempotencyKey works too, and the header wins", async () => {
    const a = await json(send({ ...basic, idempotencyKey: "k1" }));
    expect((await json(send({ ...basic, idempotencyKey: "k1" }))).id).toBe(a.id);
    const b = await json(send({ ...basic, idempotencyKey: "k1" }, { "Idempotency-Key": "k2" }));
    expect(b.id).not.toBe(a.id);
  });

  it("a test key records status test, sends nothing and skips suppressions", async () => {
    await call("POST", "/v1/admin/suppressions", { key: ADMIN_KEY, body: { address: "suppressed-test@example.com" } });
    const r = await send({ ...basic, to: "suppressed-test@example.com" }, {}, p.testKey);
    expect(r.status).toBe(200);
    const { id, status } = await json(r);
    expect(status).toBe("test");
    expect(enqueueSend).not.toHaveBeenCalled();
    const rec = await json(call("GET", `/v1/emails/${id}`, { key: p.liveKey }));
    expect(rec).toMatchObject({ mode: "test", status: "test", recipients: [{ status: "test" }] });
    expect(rec.events.map((e: any) => e.type)).toEqual(["email.test"]);
  });

  it("429 daily_limit_exceeded when the project limit is reached", async () => {
    await call("PATCH", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY, body: { dailyLimit: 2 } });
    expect((await send(basic)).status).toBe(202);
    expect((await send(basic)).status).toBe(202);
    const r = await send(basic);
    expect(r.status).toBe(429);
    expect((await json(r)).error.code).toBe("daily_limit_exceeded");
    // test keys are not counted
    expect((await send(basic, {}, p.testKey)).status).toBe(200);
  });

  it("marks the email failed and returns 500 when the queue send throws", async () => {
    enqueueSend.mockRejectedValueOnce(new Error("queue down"));
    const r = await send(basic);
    expect(r.status).toBe(500);
    expect((await json(r)).error.type).toBe("internal_error");
    const row = await env.DB.prepare("SELECT status, last_error_code FROM emails WHERE project_id = ?").bind(p.project.id).first<any>();
    expect(row).toEqual({ status: "failed", last_error_code: "queue_error" });
  });

  it("renders a Git template and stores template_name", async () => {
    const r = await send({ from: basic.from, to: basic.to, template: "welcome", data: { name: "Ann", appName: "Acme", loginUrl: "https://acme.com/login" } });
    expect(r.status).toBe(202);
    const { id } = await json(r);
    const rec = await json(call("GET", `/v1/emails/${id}`, { key: p.liveKey }));
    expect(rec).toMatchObject({ template: "welcome", subject: "Welcome to Acme" });
    const content = await json(call("GET", `/v1/emails/${id}/content`, { key: p.liveKey }));
    expect(content.html).toContain("Ann");
    expect(content.text).toContain("Ann");
  });

  it("bad template data -> 400 invalid_template_data with the field path", async () => {
    const r = await send({ from: basic.from, to: basic.to, template: "welcome", data: { name: "Ann", appName: "H", loginUrl: "not-a-url" } });
    expect(r.status).toBe(400);
    expect((await json(r)).error).toMatchObject({ code: "invalid_template_data", param: "data.loginUrl" });
  });
});

describe("POST /v1/emails/batch", () => {
  it("queues valid items, reports errors per item in order, uses sendBatch", async () => {
    const r = await call("POST", "/v1/emails/batch", { key: p.liveKey, body: [basic, { ...basic, from: "x@evil.com" }, { ...basic, to: "b@example.com" }] });
    expect(r.status).toBe(200);
    const { data } = await json(r);
    expect(data[0]).toMatchObject({ status: "queued" });
    expect(data[1].error.code).toBe("invalid_sender");
    expect(data[2]).toMatchObject({ status: "queued" });
    expect(enqueueSend).not.toHaveBeenCalled();
    expect(enqueueSendBatch).toHaveBeenCalledTimes(1);
    expect(enqueueSendBatch.mock.calls[0]![1]).toHaveLength(2);
    const src = await env.DB.prepare("SELECT DISTINCT source FROM emails WHERE project_id = ?").bind(p.project.id).all();
    expect(src.results).toEqual([{ source: "batch" }]);
  });

  it("whole-batch Idempotency-Key is stored per item as key:index", async () => {
    const h = { "Idempotency-Key": "batch-1" };
    const a = await json(call("POST", "/v1/emails/batch", { key: p.liveKey, body: [basic, basic], headers: h }));
    const b = await json(call("POST", "/v1/emails/batch", { key: p.liveKey, body: [basic, basic], headers: h }));
    expect(b.data.map((x: any) => x.id)).toEqual(a.data.map((x: any) => x.id));
    expect(b.data.every((x: any) => x.idempotent)).toBe(true);
    const keys = await env.DB.prepare("SELECT idempotency_key FROM emails WHERE project_id = ? ORDER BY idempotency_key").bind(p.project.id).all();
    expect(keys.results.map((k: any) => k.idempotency_key)).toEqual(["batch-1:0", "batch-1:1"]);
  });

  it("dryRun validates without writing", async () => {
    const r = await json(call("POST", "/v1/emails/batch?dryRun=true", { key: p.liveKey, body: [basic, { ...basic, to: "bad" }] }));
    expect(r.dryRun).toBe(true);
    expect(r.data[0]).toMatchObject({ ok: true, from: "hello@acme.com", to: ["user@example.com"] });
    expect(r.data[1].error.code).toBe("invalid_body");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM emails WHERE project_id = ?").bind(p.project.id).first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("rejects non-arrays and more than 100 items", async () => {
    expect((await call("POST", "/v1/emails/batch", { key: p.liveKey, body: basic })).status).toBe(400);
    expect((await call("POST", "/v1/emails/batch", { key: p.liveKey, body: Array(101).fill(basic) })).status).toBe(400);
  });
});

describe("listing, content, events, domains", () => {
  it("lists newest first with a cursor and filters, including cc matches for `to`", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await json(send({ ...basic, subject: `Order ${i}`, cc: i === 1 ? "boss@corp.com" : undefined, tags: { n: String(i) } }))).id);
    const page1 = await json(call("GET", "/v1/emails?limit=2", { key: p.liveKey }));
    expect(page1.data.map((e: any) => e.id)).toEqual([ids[2], ids[1]]);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await json(call("GET", `/v1/emails?limit=2&cursor=${page1.nextCursor}`, { key: p.liveKey }));
    expect(page2.data.map((e: any) => e.id)).toEqual([ids[0]]);
    expect(page2.nextCursor).toBeNull();

    expect((await json(call("GET", "/v1/emails?to=boss@corp.com", { key: p.liveKey }))).data.map((e: any) => e.id)).toEqual([ids[1]]);
    expect((await json(call("GET", "/v1/emails?to=corp", { key: p.liveKey }))).data).toHaveLength(1);
    expect((await json(call("GET", "/v1/emails?q=order%202", { key: p.liveKey }))).data.map((e: any) => e.id)).toEqual([ids[2]]);
    expect((await json(call("GET", "/v1/emails?tag=n:0", { key: p.liveKey }))).data.map((e: any) => e.id)).toEqual([ids[0]]);
    expect((await json(call("GET", "/v1/emails?status=sent", { key: p.liveKey }))).data).toHaveLength(0);
    expect((await call("GET", "/v1/emails?status=nope", { key: p.liveKey })).status).toBe(400);
  });

  it("scopes everything to the key's project", async () => {
    const other = await setupProject();
    const { id } = await json(send(basic));
    const r = await call("GET", `/v1/emails/${id}`, { key: other.liveKey });
    expect(r.status).toBe(404);
    expect((await json(r)).error.code).toBe("email_not_found");
    expect((await json(call("GET", "/v1/emails", { key: other.liveKey }))).data).toHaveLength(0);
  });

  it("returns content with attachment sizes, and content_expired when R2 is gone", async () => {
    const { id } = await json(send({ ...basic, headers: { "X-Campaign": "c1" }, attachments: [{ filename: "hello.txt", content: "aGVsbG8=" }] }));
    const c = await json(call("GET", `/v1/emails/${id}/content`, { key: p.liveKey }));
    expect(c).toMatchObject({ html: "<p>Hi</p>", text: "Hi", headers: { "X-Campaign": "c1" }, attachments: [{ filename: "hello.txt", type: null, size: 5 }] });
    await env.PAYLOADS.delete(`payloads/${id}.json`);
    expect((await json(call("GET", `/v1/emails/${id}/content`, { key: p.liveKey }))).error.code).toBe("content_expired");
  });

  it("lists project events", async () => {
    const { id } = await json(send(basic));
    const ev = await json(call("GET", `/v1/events?emailId=${id}`, { key: p.liveKey }));
    expect(ev.data).toHaveLength(1);
    expect(ev.data[0]).toMatchObject({ emailId: id, type: "email.queued", projectId: p.project.id });
  });

  it("lists domains with verification unknown when CF_API_TOKEN is unset", async () => {
    const d = await json(call("GET", "/v1/domains", { key: p.liveKey }));
    expect(d.data).toEqual([{ domain: "acme.com", defaultFrom: "Acme <hello@acme.com>", verification: "unknown", checkedAt: null }]);
  });
});

describe("scheduled sends (phase 3)", () => {
  it("within 12h: status scheduled, enqueued with a delay", async () => {
    const at = new Date(Date.now() + 2 * 3600_000).toISOString();
    const r = await send({ ...basic, scheduledAt: at });
    expect(r.status).toBe(202);
    const { id, status } = await json(r);
    expect(status).toBe("scheduled");
    const call0 = enqueueSend.mock.calls[0]![1];
    expect(call0.body.emailId).toBe(id);
    expect(call0.delaySeconds).toBeGreaterThan(7190);
    expect(call0.delaySeconds).toBeLessThanOrEqual(7200);
    const row = await env.DB.prepare("SELECT status, enqueued_at, scheduled_at FROM emails WHERE id = ?").bind(id).first<any>();
    expect(row.status).toBe("scheduled");
    expect(row.enqueued_at).toBeTruthy();
  });

  it("beyond 12h: not enqueued until the cron", async () => {
    const { id } = await json(send({ ...basic, scheduledAt: new Date(Date.now() + 3 * 86400_000).toISOString() }));
    expect(enqueueSend).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT enqueued_at FROM emails WHERE id = ?").bind(id).first<any>();
    expect(row.enqueued_at).toBeNull();
  });

  it("cancel a scheduled email; cancel again -> 409 not_cancelable", async () => {
    const { id } = await json(send({ ...basic, scheduledAt: new Date(Date.now() + 86400_000).toISOString() }));
    const r = await call("DELETE", `/v1/emails/${id}`, { key: p.liveKey });
    expect(await r.json()).toEqual({ id, status: "canceled" });
    const rec = await json(call("GET", `/v1/emails/${id}`, { key: p.liveKey }));
    expect(rec.status).toBe("canceled");
    expect(rec.events.map((e: any) => e.type)).toEqual(["email.scheduled", "email.canceled"]);
    const again = await call("DELETE", `/v1/emails/${id}`, { key: p.liveKey });
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe("not_cancelable");
  });

  it("a queued (not scheduled) email is not cancelable", async () => {
    const { id } = await json(send(basic));
    expect((await call("DELETE", `/v1/emails/${id}`, { key: p.liveKey })).status).toBe(409);
  });

  it("reschedule updates scheduled_at and re-enqueues when within 12h", async () => {
    const { id } = await json(send({ ...basic, scheduledAt: new Date(Date.now() + 3 * 86400_000).toISOString() }));
    const at = new Date(Date.now() + 3600_000).toISOString();
    const rec = await json(call("PATCH", `/v1/emails/${id}`, { key: p.liveKey, body: { scheduledAt: at } }));
    expect(rec.scheduledAt).toBe(at);
    expect(enqueueSend).toHaveBeenCalledTimes(1);
  });
});

describe("admin email routes", () => {
  it("cross-project list with ?project, get, content and resend", async () => {
    const { id } = await json(send({ ...basic, tags: { a: "1" } }));
    const list = await json(call("GET", `/v1/admin/emails?project=${p.slug}`, { key: ADMIN_KEY }));
    expect(list.data.map((e: any) => e.id)).toEqual([id]);
    expect((await json(call("GET", `/v1/admin/emails/${id}`, { key: ADMIN_KEY }))).id).toBe(id);
    expect((await json(call("GET", `/v1/admin/emails/${id}/content`, { key: ADMIN_KEY }))).html).toBe("<p>Hi</p>");
    const resent = await call("POST", `/v1/admin/emails/${id}/resend`, { key: ADMIN_KEY });
    expect(resent.status).toBe(202);
    const r2 = await json(call("GET", `/v1/admin/emails/${(await json(resent)).id}`, { key: ADMIN_KEY }));
    expect(r2).toMatchObject({ tags: { a: "1", resent_from: id }, subject: "Welcome", to: ["user@example.com"], fromName: "Acme" });
  });

  it("project-scoped admin mirror /v1/admin/projects/:slug/emails", async () => {
    const r = await call("POST", `/v1/admin/projects/${p.slug}/emails`, { key: ADMIN_KEY, body: basic });
    expect(r.status).toBe(202);
    const list = await json(call("GET", `/v1/admin/projects/${p.slug}/emails`, { key: ADMIN_KEY }));
    expect(list.data).toHaveLength(1);
    expect((await call("GET", `/v1/admin/projects/nope/emails`, { key: ADMIN_KEY })).status).toBe(404);
  });
});

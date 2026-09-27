import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index";
import { emailProvider } from "../../src/core/provider";
import { queueOps } from "../../src/queue/producer";
import { sendEmail } from "../../src/core/send";
import { rollupDay } from "../../src/core/analytics";
import { advanceBroadcasts, enqueueDueScheduled, maybeRollup } from "../../src/cron/scheduled";
import { unsubscribeToken } from "../../src/core/contacts";
import { ADMIN_KEY, call, cfEvent, env, json, makeBatch, makeMessage, setupProject, type TestProject } from "../helpers";

const enqueueSend = vi.spyOn(queueOps, "send").mockResolvedValue();
const enqueueBatch = vi.spyOn(queueOps, "sendBatch").mockResolvedValue();
vi.spyOn(queueOps, "webhooks").mockResolvedValue();
const providerSend = vi.spyOn(emailProvider, "send");

let p: TestProject;
beforeEach(async () => {
  enqueueSend.mockClear();
  enqueueBatch.mockClear();
  providerSend.mockReset();
  await env.DB.prepare("DELETE FROM suppressions").run();
  p = await setupProject();
});

const basic = { from: "hello@acme.com", to: "user@example.com", subject: "Hi", html: "<p>Hi</p>" };

async function sendAndDeliver(input: Record<string, unknown>, messageId: string, events: Array<"delivered" | "bounced" | "complained" | "deferred"> = []) {
  const { id } = await sendEmail(env, { project: p.project, mode: "live", source: "http", apiKeyId: null }, input);
  providerSend.mockResolvedValueOnce({ messageId });
  await worker.queue(makeBatch("flaresend-send", [makeMessage({ kind: "send" as const, emailId: id, projectId: p.project.id, attempt: 0 })]), env);
  for (const e of events) {
    const to = Array.isArray(input.to) ? input.to[0] : input.to;
    await worker.queue(makeBatch("flaresend-events", [makeMessage(cfEvent(e, messageId, String(to)))]), env);
  }
  return id;
}

describe("open and click tracking (7.4)", () => {
  it("records opens once, clicks every time, redirects, and 404s unknown tokens", async () => {
    const html = '<html><body><a href="https://acme.com/pricing?a=1&amp;b=2">Pricing</a></body></html>';
    const id = await sendAndDeliver({ ...basic, html, trackOpens: true, trackClicks: true }, "cf-trk");
    const sentHtml = providerSend.mock.calls[0]![3] as string;
    const openPath = new URL(/src="([^"]+\/t\/o\/[^"]+)"/.exec(sentHtml)![1]!).pathname;
    const clickPath = new URL(/href="([^"]+\/t\/c\/[^"]+)"/.exec(sentHtml)![1]!).pathname;

    const o = await call("GET", openPath, { headers: { "User-Agent": "MailClient/1" } });
    expect(o.status).toBe(200);
    expect(o.headers.get("Content-Type")).toBe("image/gif");
    expect(o.headers.get("Cache-Control")).toContain("no-store");
    await call("GET", openPath);

    const c = await call("GET", clickPath);
    expect(c.status).toBe(302);
    expect(c.headers.get("Location")).toBe("https://acme.com/pricing?a=1&b=2");
    await call("GET", clickPath);

    const rec = await json(call("GET", `/v1/emails/${id}`, { key: p.liveKey }));
    expect(rec.openedAt).toBeTruthy();
    expect(rec.firstClickedAt).toBeTruthy();
    const types = rec.events.map((e: any) => e.type);
    expect(types.filter((t: string) => t === "email.opened")).toHaveLength(1);
    expect(types.filter((t: string) => t === "email.clicked")).toHaveLength(2);
    expect(rec.events.find((e: any) => e.type === "email.opened").data).toEqual({ userAgent: "MailClient/1" });
    const clicks = await env.DB.prepare("SELECT clicks FROM email_links WHERE email_id = ?").bind(id).first("clicks");
    expect(clicks).toBe(2);

    expect((await call("GET", "/t/c/unknowntoken0000")).status).toBe(404);
    expect((await call("GET", "/t/o/unknown")).status).toBe(404);
  });

  it("text-only emails and tracking-off emails are never modified", async () => {
    await sendAndDeliver({ ...basic, html: undefined, text: "https://acme.com", trackOpens: true, trackClicks: true }, "cf-txt");
    expect(providerSend.mock.calls[0]![3]).toBeNull();
    await sendAndDeliver({ ...basic, html: '<a href="https://x.com">x</a>' }, "cf-off");
    expect(providerSend.mock.calls[1]![3]).toBe('<a href="https://x.com">x</a>');
  });

  it("project defaults turn tracking on", async () => {
    await call("PATCH", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY, body: { trackOpens: true } });
    p.project.track_opens = 1;
    const { id } = await sendEmail(env, { project: p.project, mode: "live", source: "http", apiKeyId: null }, basic);
    expect(await env.DB.prepare("SELECT track_opens, track_clicks FROM emails WHERE id = ?").bind(id).first()).toEqual({ track_opens: 1, track_clicks: 0 });
  });
});

describe("analytics (7.1)", () => {
  it("counts match GROUP BY status and rates are computed", async () => {
    await sendAndDeliver({ ...basic, to: "a1@example.com" }, "cf-a1", ["delivered"]);
    await sendAndDeliver({ ...basic, to: "a2@example.com" }, "cf-a2", ["delivered"]);
    await sendAndDeliver({ ...basic, to: "a3@example.com" }, "cf-a3", ["bounced"]);
    await sendEmail(env, { project: p.project, mode: "live", source: "http", apiKeyId: null }, { ...basic, to: "queued@example.com" });

    const a = await json(call("GET", "/v1/analytics?range=7d", { key: p.liveKey }));
    expect(a.buckets).toHaveLength(7);
    expect(a.totals).toMatchObject({ sent: 3, delivered: 2, bounced: 1, complained: 0 });
    const byStatus = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM emails WHERE project_id = ? GROUP BY status").bind(p.project.id).all<any>();
    for (const r of byStatus.results) {
      if (r.status in a.totals) expect(a.totals[r.status]).toBe(r.n);
    }
    expect(a.deliveryRate).toBeCloseTo(2 / 3, 3);
    expect(a.bounceRate).toBeCloseTo(1 / 3, 3);
    expect(a.p50DeliveryMs).toBe(1234);
    expect(a.topBouncedDomains).toEqual([{ domain: "example.com", count: 1 }]);

    const hourly = await json(call("GET", "/v1/analytics?interval=hour", { key: p.liveKey }));
    expect(hourly.totals.sent).toBe(3);
    const admin = await json(call("GET", `/v1/admin/analytics?project=${p.slug}`, { key: ADMIN_KEY }));
    expect(admin.totals.sent).toBe(3);
  });

  it("closed days come from the rollup once it has run", async () => {
    const id = await sendAndDeliver({ ...basic, to: "old@example.com" }, "cf-old", ["delivered"]);
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    await env.DB.prepare("UPDATE emails SET created_at = ? WHERE id = ?").bind(`${yesterday}T12:00:00.000Z`, id).run();
    expect(await rollupDay(env.DB, yesterday)).toBe(true);
    expect(await rollupDay(env.DB, yesterday)).toBe(false); // guarded by _done
    // Change the live row; the rolled-up day must not change.
    await env.DB.prepare("UPDATE emails SET status = 'bounced' WHERE id = ?").bind(id).run();
    const a = await json(call("GET", "/v1/analytics", { key: p.liveKey }));
    const b = a.buckets.find((x: any) => x.bucket === yesterday);
    expect(b).toMatchObject({ sent: 1, delivered: 1, bounced: 0 });
  });

  it("maybeRollup waits until 00:10 UTC", async () => {
    expect(await maybeRollup(env, new Date("2030-01-02T00:05:00Z"))).toBe(false);
    expect(await maybeRollup(env, new Date("2030-01-02T00:15:00Z"))).toBe(true);
    expect(await maybeRollup(env, new Date("2030-01-02T00:20:00Z"))).toBe(false);
  });
});

describe("scheduled sends via cron (7.2)", () => {
  it("enqueues emails due within 12h exactly once", async () => {
    const soon = await json(call("POST", "/v1/emails", { key: p.liveKey, body: { ...basic, scheduledAt: new Date(Date.now() + 3 * 86400_000).toISOString() } }));
    expect(enqueueSend).not.toHaveBeenCalled();
    // Pretend three days passed: the email is now 1h away.
    const now = Date.now() + 3 * 86400_000 - 3600_000;
    expect(await enqueueDueScheduled(env, now)).toBeGreaterThanOrEqual(1);
    const job = enqueueBatch.mock.calls.flatMap((c) => c[1]).find((j) => j.body.emailId === soon.id)!;
    expect(job.delaySeconds).toBeGreaterThan(3500);
    expect(job.delaySeconds).toBeLessThanOrEqual(3600);
    enqueueBatch.mockClear();
    await enqueueDueScheduled(env, now);
    expect(enqueueBatch.mock.calls.flatMap((c) => c[1]).some((j) => j.body.emailId === soon.id)).toBe(false);
  });

  it("the scheduled() handler runs without throwing", async () => {
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
    await worker.scheduled({ scheduledTime: Date.now(), cron: "*/5 * * * *", noRetry() {} } as ScheduledController, env, ctx);
    await Promise.all((ctx.waitUntil as any).mock.calls.map((c: any[]) => c[0]));
  });
});

describe("contacts, audiences, broadcasts (7.5)", () => {
  async function setupAudience(n: number) {
    const contacts = Array.from({ length: n }, (_, i) => ({ email: `c${i}@example.com`, firstName: `F${i}`, lastName: "L", data: { plan: i % 2 ? "pro" : "free" } }));
    const imported = await json(call("POST", "/v1/contacts/import", { key: p.liveKey, body: contacts }));
    expect(imported).toEqual({ created: n, updated: 0 });
    const all = await json(call("GET", "/v1/contacts?limit=100", { key: p.liveKey }));
    const aud = await json(call("POST", "/v1/audiences", { key: p.liveKey, body: { name: "Beta users" } }));
    const added = await json(call("POST", `/v1/audiences/${aud.id}/contacts`, { key: p.liveKey, body: { contactIds: all.data.map((c: any) => c.id) } }));
    expect(added).toEqual({ added: n });
    return { aud, contacts: all.data as any[] };
  }

  it("contacts CRUD, upsert by email and import counts", async () => {
    const c = await json(call("POST", "/v1/contacts", { key: p.liveKey, body: { email: "Ann@Example.com", firstName: "Ann" } }));
    expect(c).toMatchObject({ email: "ann@example.com", firstName: "Ann", unsubscribed: false });
    const again = await json(call("POST", "/v1/contacts", { key: p.liveKey, body: { email: "ann@example.com", lastName: "Lee" } }));
    expect(again).toMatchObject({ id: c.id, firstName: "Ann", lastName: "Lee" });
    expect(await json(call("POST", "/v1/contacts/import", { key: p.liveKey, body: [{ email: "ann@example.com" }, { email: "new@example.com" }] }))).toEqual({ created: 1, updated: 1 });
    expect((await json(call("PATCH", `/v1/contacts/${c.id}`, { key: p.liveKey, body: { unsubscribed: true } }))).unsubscribed).toBe(true);
    expect((await json(call("GET", "/v1/contacts?q=ann", { key: p.liveKey }))).data).toHaveLength(1);
    expect(await json(call("DELETE", `/v1/contacts/${c.id}`, { key: p.liveKey }))).toEqual({ id: c.id, deleted: true });
  });

  it("broadcasts are off unless the project enables them", async () => {
    const aud = await json(call("POST", "/v1/audiences", { key: p.liveKey, body: { name: "x" } }));
    const r = await call("POST", "/v1/broadcasts", { key: p.liveKey, body: { audienceId: aud.id, from: "hello@acme.com", subject: "s", html: "h" } });
    expect(r.status).toBe(403);
    expect((await json(r)).error.code).toBe("broadcasts_disabled");
  });

  it("a 20-contact broadcast: 20 tagged emails, honours unsubscribes and suppressions, one-click unsubscribe works", async () => {
    await call("PATCH", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY, body: { broadcastsEnabled: true } });
    const { aud, contacts } = await setupAudience(22);
    // one unsubscribed, one suppressed -> 20 sends
    const unsub = contacts.find((c) => c.email === "c0@example.com")!;
    await call("PATCH", `/v1/contacts/${unsub.id}`, { key: p.liveKey, body: { unsubscribed: true } });
    await call("POST", "/v1/admin/suppressions", { key: ADMIN_KEY, body: { address: "c1@example.com" } });

    const bc = await json(call("POST", "/v1/broadcasts", {
      key: p.liveKey,
      body: { audienceId: aud.id, from: "Acme <hello@acme.com>", subject: "Hi {{first_name}}", html: '<p>Hello {{first_name}} ({{plan}}) <a href="{{{unsubscribe_url}}}">unsubscribe</a></p>' },
    }));
    expect(bc.status).toBe("draft");
    const started = await json(call("POST", `/v1/broadcasts/${bc.id}/send`, { key: p.liveKey, body: {} }));
    expect(started).toMatchObject({ status: "sending", total: 21 });

    await advanceBroadcasts(env);
    const done = await json(call("GET", `/v1/broadcasts/${bc.id}`, { key: p.liveKey }));
    expect(done).toMatchObject({ status: "sent", sent: 20 });
    expect(done.completedAt).toBeTruthy();
    expect(done.counts).toEqual({ queued: 20 });

    const emails = await env.DB.prepare("SELECT id, to_addresses, subject, source FROM emails WHERE project_id = ? AND json_extract(tags, '$.broadcast_id') = ?").bind(p.project.id, bc.id).all<any>();
    expect(emails.results).toHaveLength(20);
    const addrs = emails.results.map((e) => JSON.parse(e.to_addresses)[0]);
    expect(addrs).not.toContain("c0@example.com");
    expect(addrs).not.toContain("c1@example.com");
    expect(emails.results.every((e) => e.source === "broadcast")).toBe(true);
    const e2 = emails.results.find((e) => JSON.parse(e.to_addresses)[0] === "c2@example.com")!;
    expect(e2.subject).toBe("Hi F2");
    const content = await json(call("GET", `/v1/emails/${e2.id}/content`, { key: p.liveKey }));
    expect(content.html).toContain("Hello F2 (free)");
    expect(content.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const unsubUrl = /<([^>]+)>/.exec(content.headers["List-Unsubscribe"])![1]!;
    expect(content.html).toContain(unsubUrl);

    // one-click unsubscribe
    const path = new URL(unsubUrl).pathname;
    expect((await call("GET", path)).status).toBe(200);
    const post = await call("POST", path);
    expect(post.status).toBe(200);
    expect(await post.text()).toContain("c2@example.com");
    const c2 = contacts.find((c) => c.email === "c2@example.com")!;
    expect((await json(call("GET", `/v1/contacts/${c2.id}`, { key: p.liveKey }))).unsubscribed).toBe(true);

    // re-running the tick sends nothing more
    await advanceBroadcasts(env);
    expect((await json(call("GET", `/v1/broadcasts/${bc.id}`, { key: p.liveKey }))).sent).toBe(20);
  });

  it("caps recipients at BROADCAST_MAX_RECIPIENTS", async () => {
    await call("PATCH", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY, body: { broadcastsEnabled: true } });
    const { aud } = await setupAudience(3);
    const bc = await json(call("POST", "/v1/broadcasts", { key: p.liveKey, body: { audienceId: aud.id, from: "hello@acme.com", subject: "s", html: "h" } }));
    const { startBroadcast } = await import("../../src/core/broadcasts");
    const small = { ...env, BROADCAST_MAX_RECIPIENTS: "2" } as unknown as Env;
    p.project.broadcasts_enabled = 1;
    await expect(startBroadcast(small, p.project, bc.id, {})).rejects.toMatchObject({ code: "too_many_recipients" });
  });

  it("scheduled broadcast starts when due; cancel stops it", async () => {
    await call("PATCH", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY, body: { broadcastsEnabled: true } });
    const { aud } = await setupAudience(2);
    const bc = await json(call("POST", "/v1/broadcasts", { key: p.liveKey, body: { audienceId: aud.id, from: "hello@acme.com", subject: "s", html: "h" } }));
    const at = new Date(Date.now() + 3600_000).toISOString();
    expect((await json(call("POST", `/v1/broadcasts/${bc.id}/send`, { key: p.liveKey, body: { scheduledAt: at } }))).status).toBe("scheduled");
    await advanceBroadcasts(env, Date.now());
    expect((await json(call("GET", `/v1/broadcasts/${bc.id}`, { key: p.liveKey }))).status).toBe("scheduled");
    const canceled = await json(call("POST", `/v1/broadcasts/${bc.id}/cancel`, { key: p.liveKey }));
    expect(canceled.status).toBe("canceled");
    await advanceBroadcasts(env, Date.now() + 2 * 3600_000);
    expect((await json(call("GET", `/v1/broadcasts/${bc.id}`, { key: p.liveKey }))).sent).toBe(0);
  });

  it("invalid unsubscribe tokens are rejected", async () => {
    expect((await call("GET", "/u/bad.token")).status).toBe(404);
    const forged = await unsubscribeToken("wrong-secret", "ct_x");
    expect((await call("POST", `/u/${forged}`)).status).toBe(404);
  });
});

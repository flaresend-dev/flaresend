import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailProvider } from "../../src/core/provider";
import { DEFAULT_DMARC, absoluteName, domainStatus, planRecord, setupDomain } from "../../src/core/domains";
import { queueOps } from "../../src/queue/producer";
import { ADMIN_KEY, call, env, json, setupProject, type TestProject } from "../helpers";

vi.spyOn(queueOps, "send").mockResolvedValue();
vi.spyOn(queueOps, "sendBatch").mockResolvedValue();
const webhookEnqueue = vi.spyOn(queueOps, "webhooks").mockResolvedValue();
vi.spyOn(emailProvider, "send").mockResolvedValue({ messageId: "x" });

let p: TestProject;
beforeEach(async () => {
  webhookEnqueue.mockClear();
  p = await setupProject();
});

describe("webhook routes", () => {
  it("CRUD, secret shown once, rotate, test event, deliveries", async () => {
    const created = await call("POST", "/v1/webhooks", { key: p.liveKey, body: { url: "https://hooks.example.com/a", events: ["email.delivered", "email.bounced"] } });
    expect(created.status).toBe(201);
    const wh = await json(created);
    expect(wh).toMatchObject({ url: "https://hooks.example.com/a", events: ["email.delivered", "email.bounced"], enabled: true });
    expect(wh.secret).toMatch(/^whsec_[0-9A-Za-z]{32}$/);

    const got = await json(call("GET", `/v1/webhooks/${wh.id}`, { key: p.liveKey }));
    expect(got.secret).toBeUndefined();
    expect((await json(call("GET", "/v1/webhooks", { key: p.liveKey }))).data).toHaveLength(1);

    const patched = await json(call("PATCH", `/v1/webhooks/${wh.id}`, { key: p.liveKey, body: { events: ["*"], enabled: false } }));
    expect(patched).toMatchObject({ events: ["*"], enabled: false });
    expect((await call("POST", `/v1/webhooks/${wh.id}/test`, { key: p.liveKey })).status).toBe(409);
    await call("PATCH", `/v1/webhooks/${wh.id}`, { key: p.liveKey, body: { enabled: true } });

    const rotated = await json(call("POST", `/v1/webhooks/${wh.id}/rotate-secret`, { key: p.liveKey }));
    expect(rotated.secret).toMatch(/^whsec_/);
    expect(rotated.secret).not.toBe(wh.secret);

    const t = await call("POST", `/v1/webhooks/${wh.id}/test`, { key: p.liveKey });
    expect(t.status).toBe(202);
    const { deliveryId } = await json(t);
    expect(webhookEnqueue).toHaveBeenCalledWith(expect.anything(), [deliveryId], undefined);
    const deliveries = await json(call("GET", `/v1/webhooks/${wh.id}/deliveries`, { key: p.liveKey }));
    expect(deliveries.data[0]).toMatchObject({ id: deliveryId, eventType: "email.delivered", status: "pending", attempt: 0 });

    expect(await json(call("DELETE", `/v1/webhooks/${wh.id}`, { key: p.liveKey }))).toEqual({ id: wh.id, deleted: true });
    expect((await call("GET", `/v1/webhooks/${wh.id}`, { key: p.liveKey })).status).toBe(404);
  });

  it("validates input and scopes to the project", async () => {
    expect((await call("POST", "/v1/webhooks", { key: p.liveKey, body: { url: "ftp://x" } })).status).toBe(400);
    expect((await call("POST", "/v1/webhooks", { key: p.liveKey, body: { url: "https://x.com", events: ["email.nope"] } })).status).toBe(400);
    const wh = await json(call("POST", "/v1/webhooks", { key: p.liveKey, body: { url: "https://x.com" } }));
    const other = await setupProject();
    expect((await call("GET", `/v1/webhooks/${wh.id}`, { key: other.liveKey })).status).toBe(404);
  });

  it("admin mirror under /v1/admin/projects/:slug/webhooks", async () => {
    const r = await call("POST", `/v1/admin/projects/${p.slug}/webhooks`, { key: ADMIN_KEY, body: { url: "https://x.com/h" } });
    expect(r.status).toBe(201);
    expect((await json(call("GET", `/v1/admin/projects/${p.slug}/webhooks`, { key: ADMIN_KEY }))).data).toHaveLength(1);
  });

  it("email.queued fires for subscribed webhooks", async () => {
    await call("POST", "/v1/webhooks", { key: p.liveKey, body: { url: "https://x.com/h", events: ["email.queued"] } });
    await call("POST", "/v1/emails", { key: p.liveKey, body: { to: "u@example.com", subject: "s", text: "t" } });
    expect(webhookEnqueue).toHaveBeenCalledTimes(1);
  });
});

describe("templates (Git + D1)", () => {
  it("lists Git templates and renders one for preview", async () => {
    const list = await json(call("GET", "/v1/templates", { key: p.liveKey }));
    expect(list.data.map((t: any) => t.name)).toEqual(expect.arrayContaining(["welcome", "password-reset", "magic-link", "notification", "invoice"]));
    expect(list.data.every((t: any) => t.source === "git")).toBe(true);
    const r = await json(call("POST", "/v1/templates/magic-link/render", { key: p.liveKey, body: { data: { loginUrl: "https://acme.com/l" } } }));
    expect(r.subject).toBe("Your sign-in link");
    expect(r.html).toContain("https://acme.com/l");
    const g = await json(call("GET", "/v1/templates/welcome", { key: p.liveKey }));
    expect(g).toMatchObject({ source: "git", name: "welcome" });
    expect(g.html).toBeTruthy();
  });

  it("creates, versions, restores; D1 shadows Git; sends record template_version", async () => {
    const created = await call("POST", "/v1/templates", {
      key: p.liveKey,
      body: { name: "welcome", subject: "Hello {{name}}", html: "<p>v1 {{name}}</p>", variables: [{ name: "name", required: true, example: "Ann" }] },
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ source: "db", version: 1 });

    const v2 = await json(call("PATCH", "/v1/templates/welcome", { key: p.liveKey, body: { html: "<p>v2 {{name}}</p>" } }));
    expect(v2.version).toBe(2);
    const versions = await json(call("GET", "/v1/templates/welcome/versions", { key: p.liveKey }));
    expect(versions.data.map((v: any) => v.version)).toEqual([2, 1]);

    const sent = await json(call("POST", "/v1/emails", { key: p.liveKey, body: { to: "u@example.com", template: "welcome", data: { name: "Bo" } } }));
    const rec = await json(call("GET", `/v1/emails/${sent.id}`, { key: p.liveKey }));
    expect(rec).toMatchObject({ template: "welcome", templateVersion: 2, subject: "Hello Bo" });
    expect((await json(call("GET", `/v1/emails/${sent.id}/content`, { key: p.liveKey }))).html).toBe("<p>v2 Bo</p>");

    const restored = await json(call("POST", "/v1/templates/welcome/restore", { key: p.liveKey, body: { version: 1 } }));
    expect(restored).toMatchObject({ version: 3, html: "<p>v1 {{name}}</p>" });

    const missing = await call("POST", "/v1/emails", { key: p.liveKey, body: { to: "u@example.com", template: "welcome", data: {} } });
    expect(missing.status).toBe(400);
    expect((await json(missing)).error).toMatchObject({ code: "invalid_template_data", param: "data.name" });

    const list = await json(call("GET", "/v1/templates", { key: p.liveKey }));
    expect(list.data.filter((t: any) => t.name === "welcome")).toEqual([expect.objectContaining({ source: "db" })]);

    expect(await json(call("DELETE", "/v1/templates/welcome", { key: p.liveKey }))).toEqual({ name: "welcome", deleted: true });
    expect((await json(call("GET", "/v1/templates/welcome", { key: p.liveKey }))).source).toBe("git");
  });

  it("rejects template syntax errors and duplicate names", async () => {
    const bad = await call("POST", "/v1/templates", { key: p.liveKey, body: { name: "x", subject: "s", html: "{{#if a}}open" } });
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.code).toBe("invalid_template");
    await call("POST", "/v1/templates", { key: p.liveKey, body: { name: "dup", subject: "s", html: "h" } });
    expect((await call("POST", "/v1/templates", { key: p.liveKey, body: { name: "dup", subject: "s", html: "h" } })).status).toBe(409);
  });
});

describe("domain verification (6.6)", () => {
  it("queries Cloudflare and caches for 10 minutes", async () => {
    const e = { ...env, CF_API_TOKEN: "tok" } as Env;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/zones?name=acme.com")) return Response.json({ success: true, result: [{ id: "z1", name: "acme.com" }] });
      if (url.includes("/zones?name=")) return Response.json({ success: true, result: [] });
      if (url.endsWith("/zones/z1/email/sending/subdomains")) {
        return Response.json({ success: true, result: [{ name: "send.acme.com", enabled: true, tag: "t", dkim_selector: "cf1" }] });
      }
      return new Response("unexpected", { status: 500 });
    });
    const r = await domainStatus(e, "send.acme.com", { fetchImpl: fetchImpl as unknown as typeof fetch, refresh: true });
    expect(r).toMatchObject({ domain: "send.acme.com", verification: "onboarded", details: { zone: "acme.com", dkimSelector: "cf1" } });
    const calls = fetchImpl.mock.calls.length;
    const cached = await domainStatus(e, "send.acme.com", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(cached.verification).toBe("onboarded");
    expect(fetchImpl.mock.calls.length).toBe(calls);

    const missing = await domainStatus(e, "other.acme.com", { fetchImpl: fetchImpl as unknown as typeof fetch, refresh: true });
    expect(missing.verification).toBe("missing");
  });
});

describe("domain setup", () => {
  type Rec = { type: string; name: string; content: string; priority?: number };

  /** A fake Cloudflare API holding one zone (acme.com), its DNS records, sending domains and event subscriptions. */
  function fakeCloudflare(opts: { dns?: Rec[]; subdomains?: Array<{ name: string; tag: string; enabled: boolean }> } = {}) {
    const dns: Rec[] = [...(opts.dns ?? [])];
    const subdomains = [...(opts.subdomains ?? [])];
    const subscriptions: any[] = [];
    const posts: Array<{ path: string; body: any }> = [];
    const wanted: Rec[] = [
      { type: "TXT", name: "send.acme.com", content: "v=spf1 include:_spf.mx.cloudflare.net ~all" },
      { type: "TXT", name: "cf1._domainkey.send.acme.com", content: "v=DKIM1; k=rsa; p=abc" },
      { type: "MX", name: "cf-bounce.send.acme.com", content: "route1.mx.cloudflare.net", priority: 10 },
    ];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const path = u.pathname.replace("/client/v4", "");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const ok = (result: unknown) => Response.json({ success: true, errors: [], result });
      if (method === "POST") posts.push({ path, body });
      if (path === "/zones") return ok(u.searchParams.get("name") === "acme.com" ? [{ id: "z1", name: "acme.com" }] : []);
      if (path === "/zones/z1/email/sending/subdomains") {
        if (method === "POST") {
          const created = { name: body.name, tag: "tag1", enabled: false };
          subdomains.push(created);
          return ok(created);
        }
        return ok(subdomains);
      }
      if (path === "/zones/z1/email/sending/subdomains/tag1/dns") return ok(wanted);
      if (path === "/zones/z1/dns_records") {
        if (method === "POST") {
          dns.push(body);
          return ok({ id: "r", ...body });
        }
        return ok(dns.filter((r) => r.name === u.searchParams.get("name")));
      }
      if (path === "/accounts/acct/event_subscriptions/subscriptions") {
        if (method === "POST") {
          subscriptions.push(body);
          return ok({ id: "s1", ...body });
        }
        return ok(subscriptions);
      }
      if (path === "/accounts/acct/queues") return ok([{ queue_id: "q-events", queue_name: "flaresend-events" }]);
      return Response.json({ success: false, errors: [{ message: `unexpected ${method} ${path}` }] }, { status: 404 });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, dns, posts, subscriptions };
  }

  const cfEnv = () => ({ ...env, CF_API_TOKEN: "tok", CF_ACCOUNT_ID: "acct" }) as unknown as Env;

  it("onboards a new domain: sending domain, DNS records, DMARC, delivery events", async () => {
    const proj = await setupProject({ allowedDomains: ["acme.com", "send.acme.com"] });
    const cf = fakeCloudflare();
    const r = await setupDomain(cfEnv(), proj.project, "send.acme.com", cf.fetchImpl);

    expect(r.zone).toBe("acme.com");
    expect(r.steps.map((s) => [s.step, s.status])).toEqual([
      ["sending domain", "created"],
      ["dns", "created"],
      ["dns", "created"],
      ["dns", "created"],
      ["dmarc", "created"],
      ["delivery events", "created"],
    ]);
    expect(cf.dns).toContainEqual(expect.objectContaining({ type: "MX", name: "cf-bounce.send.acme.com", priority: 10 }));
    expect(cf.dns).toContainEqual(expect.objectContaining({ type: "TXT", name: "_dmarc.send.acme.com", content: DEFAULT_DMARC }));
    expect(cf.subscriptions[0]).toMatchObject({
      source: { type: "email.sending", zone_id: "z1", domain: "send.acme.com" },
      destination: { type: "queues.queue", queue_id: "q-events" },
    });
    expect(r.record.verification).toBe("pending");

    // Running it again changes nothing.
    const again = await setupDomain(cfEnv(), proj.project, "send.acme.com", cf.fetchImpl);
    expect(again.steps.every((s) => s.status === "exists")).toBe(true);
    expect(cf.posts).toHaveLength(6);
  });

  it("never overwrites existing records and uses the zone apex DMARC", async () => {
    const proj = await setupProject({ allowedDomains: ["acme.com", "send.acme.com"] });
    const cf = fakeCloudflare({
      dns: [
        { type: "TXT", name: "send.acme.com", content: '"v=spf1 include:_spf.google.com ~all"' },
        { type: "TXT", name: "cf1._domainkey.send.acme.com", content: '"v=DKIM1; k=rsa; p=abc"' },
        { type: "CNAME", name: "cf-bounce.send.acme.com", content: "elsewhere.example.com" },
        { type: "TXT", name: "_dmarc.acme.com", content: "v=DMARC1; p=reject" },
      ],
      subdomains: [{ name: "send.acme.com", tag: "tag1", enabled: true }],
    });
    const r = await setupDomain(cfEnv(), proj.project, "send.acme.com", cf.fetchImpl);
    expect(r.steps.map((s) => [s.step, s.status])).toEqual([
      ["sending domain", "exists"],
      ["dns", "conflict"],
      ["dns", "exists"],
      ["dns", "conflict"],
      ["dmarc", "exists"],
      ["delivery events", "created"],
    ]);
    expect(cf.posts.map((x) => x.path)).toEqual(["/accounts/acct/event_subscriptions/subscriptions"]);
    expect(r.record.verification).toBe("onboarded");
  });

  it("rejects domains outside the project, a missing token, and an unknown zone", async () => {
    const proj = await setupProject({ allowedDomains: ["acme.com", "send.acme.com", "mail.nowhere.dev"] });
    const cf = fakeCloudflare();
    await expect(setupDomain(cfEnv(), proj.project, "other.acme.com", cf.fetchImpl)).rejects.toMatchObject({ code: "domain_not_in_project" });
    await expect(setupDomain({ ...env, CF_API_TOKEN: "" } as Env, proj.project, "send.acme.com", cf.fetchImpl)).rejects.toMatchObject({ code: "cf_token_missing" });
    await expect(setupDomain(cfEnv(), proj.project, "mail.nowhere.dev", cf.fetchImpl)).rejects.toMatchObject({ code: "zone_not_found" });
  });

  it("is admin-only over HTTP", async () => {
    const proj = await setupProject({ allowedDomains: ["acme.com", "send.acme.com"] });
    const res = await call("POST", "/v1/domains/send.acme.com/setup", { key: proj.liveKey });
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe("admin_only");
    // The test env has no CF_API_TOKEN, so the admin call gets past auth and stops there.
    const admin = await call("POST", `/v1/admin/projects/${proj.slug}/domains/send.acme.com/setup`, { key: ADMIN_KEY });
    expect((await json(admin)).error.code).toBe("cf_token_missing");
  });

  it("plans records without touching existing ones", () => {
    expect(absoluteName("cf1._domainkey", "acme.com")).toBe("cf1._domainkey.acme.com");
    expect(absoluteName("send.acme.com.", "acme.com")).toBe("send.acme.com");
    expect(absoluteName("@", "acme.com")).toBe("acme.com");
    const want = { type: "TXT", name: "x.acme.com", content: "v=spf1 a ~all" };
    expect(planRecord(want, []).status).toBe("create");
    expect(planRecord(want, [{ type: "TXT", content: '"v=spf1 a ~all"' }]).status).toBe("exists");
    expect(planRecord(want, [{ type: "TXT", content: "v=spf1 mx ~all" }]).status).toBe("conflict");
    expect(planRecord(want, [{ type: "TXT", content: "google-site-verification=1" }]).status).toBe("create");
    expect(planRecord({ type: "CNAME", name: "x", content: "a.b" }, [{ type: "TXT", content: "t" }]).status).toBe("conflict");
  });
});

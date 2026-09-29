import { describe, expect, it } from "vitest";
import { ADMIN_KEY, call, env, json, setupProject, uniq } from "../helpers";

describe("project auth", () => {
  it("401 missing_api_key without a key", async () => {
    const r = await call("GET", "/v1/me");
    expect(r.status).toBe(401);
    expect((await json(r)).error).toMatchObject({ type: "authentication_error", code: "missing_api_key" });
  });
  it("401 invalid_api_key for a malformed or unknown key", async () => {
    expect((await json(call("GET", "/v1/me", { key: "nope" }))).error.code).toBe("invalid_api_key");
    expect((await json(call("GET", "/v1/me", { key: "fs_live_" + "a".repeat(32) }))).error.code).toBe("invalid_api_key");
  });
  it("authenticates a live key and returns /v1/me", async () => {
    const p = await setupProject();
    const r = await call("GET", "/v1/me", { key: p.liveKey });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ project: { slug: p.slug }, key: { name: "live", mode: "live" } });
  });
  it("401 revoked_api_key after revoke", async () => {
    const p = await setupProject();
    const keys = await json(call("GET", `/v1/admin/api-keys?project=${p.slug}`, { key: ADMIN_KEY }));
    const live = keys.data.find((k: any) => k.mode === "live");
    expect((await call("DELETE", `/v1/admin/api-keys/${live.id}`, { key: ADMIN_KEY })).status).toBe(200);
    const r = await call("GET", "/v1/me", { key: p.liveKey });
    expect(r.status).toBe(401);
    expect((await json(r)).error.code).toBe("revoked_api_key");
  });
  it("401 expired_api_key after expiry", async () => {
    const p = await setupProject();
    const k = await json(call("POST", `/v1/admin/projects/${p.slug}/api-keys`, { key: ADMIN_KEY, body: { name: "exp", mode: "live", expiresAt: new Date(Date.now() + 60_000).toISOString() } }));
    await env.DB.prepare("UPDATE api_keys SET expires_at = ? WHERE id = ?").bind(new Date(Date.now() - 1000).toISOString(), k.id).run();
    expect((await json(call("GET", "/v1/me", { key: k.key }))).error.code).toBe("expired_api_key");
  });
  it("403 project_disabled for a disabled project", async () => {
    const p = await setupProject();
    await call("DELETE", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY });
    const r = await call("GET", "/v1/me", { key: p.liveKey });
    expect(r.status).toBe(403);
    expect((await json(r)).error.code).toBe("project_disabled");
  });
  it("updates last_used_at", async () => {
    const p = await setupProject();
    await call("GET", "/v1/me", { key: p.liveKey });
    const row = await env.DB.prepare("SELECT last_used_at FROM api_keys WHERE project_id = ? AND mode = 'live'").bind(p.project.id).first<{ last_used_at: string }>();
    expect(row?.last_used_at).toBeTruthy();
  });
  it("never exposes the key hash", async () => {
    const p = await setupProject();
    const r = await json(call("GET", "/v1/api-keys", { key: p.liveKey }));
    expect(r.data).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain("hash");
    expect(r.data[0].prefix).toMatch(/^fs_(live|test)_/);
  });
});

describe("admin auth", () => {
  it("rejects a missing or wrong admin key", async () => {
    expect((await call("GET", "/v1/admin/projects")).status).toBe(401);
    expect((await call("GET", "/v1/admin/projects", { key: "wrong" })).status).toBe(401);
  });
  it("a project key is not an admin key", async () => {
    const p = await setupProject();
    expect((await call("GET", "/v1/admin/projects", { key: p.liveKey })).status).toBe(401);
  });
});

describe("admin projects and keys", () => {
  it("creates a project, creates a key, and the key authenticates /v1/me", async () => {
    const slug = uniq("admin");
    const created = await call("POST", "/v1/admin/projects", {
      key: ADMIN_KEY,
      body: { slug, name: "Admin test", defaultFrom: "Admin <hi@admin.test>", allowedDomains: ["Admin.Test"] },
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ slug, allowedDomains: ["admin.test"], rpcEnabled: true, dailyLimit: 5000 });

    const key = await json(call("POST", `/v1/admin/projects/${slug}/api-keys`, { key: ADMIN_KEY, body: { name: "ci", mode: "live" } }));
    expect(key.key).toMatch(/^fs_live_/);
    expect((await json(call("GET", "/v1/me", { key: key.key }))).project.slug).toBe(slug);

    const renamed = await json(call("PATCH", `/v1/admin/api-keys/${key.id}`, { key: ADMIN_KEY, body: { name: "renamed" } }));
    expect(renamed.name).toBe("renamed");
    expect(renamed.key).toBeUndefined();
  });
  it("rejects duplicate slugs and a default_from outside the allowed domains", async () => {
    const p = await setupProject();
    expect((await call("POST", "/v1/admin/projects", { key: ADMIN_KEY, body: { slug: p.slug, name: "x", allowedDomains: ["a.com"] } })).status).toBe(409);
    const r = await call("POST", "/v1/admin/projects", { key: ADMIN_KEY, body: { slug: uniq(), name: "x", defaultFrom: "x@b.com", allowedDomains: ["a.com"] } });
    expect(r.status).toBe(400);
    expect((await json(r)).error.param).toBe("defaultFrom");
  });
  it("PATCH updates settings and can re-enable a project", async () => {
    const p = await setupProject();
    await call("DELETE", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY });
    const r = await json(call("PATCH", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY, body: { disabled: false, dailyLimit: 10, trackOpens: true } }));
    expect(r).toMatchObject({ disabledAt: null, dailyLimit: 10, trackOpens: true });
  });
  it("sets a default sender per domain, checks each is on its domain, and drops it with the domain", async () => {
    const p = await setupProject({ allowedDomains: ["acme.com", "send.acme.com"] });
    const patch = (body: unknown) => call("PATCH", `/v1/admin/projects/${p.slug}`, { key: ADMIN_KEY, body });
    const set = await json(patch({ domainSenders: { "Send.Acme.com": "Alerts <alerts@send.acme.com>" } }));
    expect(set.domainSenders).toEqual({ "send.acme.com": "Alerts <alerts@send.acme.com>" });

    const domains = await json(call("GET", "/v1/domains", { key: p.liveKey }));
    expect(domains.data.map((d: { domain: string; defaultFrom: string | null }) => [d.domain, d.defaultFrom])).toEqual([
      ["acme.com", "Acme <hello@acme.com>"],
      ["send.acme.com", "Alerts <alerts@send.acme.com>"],
    ]);

    const wrong = await patch({ domainSenders: { "acme.com": "x@send.acme.com" } });
    expect(wrong.status).toBe(400);
    expect((await json(wrong)).error.param).toBe("domainSenders.acme.com");
    expect((await patch({ domainSenders: { "other.dev": "x@other.dev" } })).status).toBe(400);

    const kept = await json(patch({ domainSenders: { "acme.com": "Hi <hi@acme.com>" } }));
    expect(kept.domainSenders).toEqual({ "acme.com": "Hi <hi@acme.com>", "send.acme.com": "Alerts <alerts@send.acme.com>" });
    const removed = await json(patch({ allowedDomains: ["acme.com"] }));
    expect(removed.domainSenders).toEqual({ "acme.com": "Hi <hi@acme.com>" });
    expect((await json(patch({ domainSenders: { "acme.com": null } }))).domainSenders).toEqual({});
  });
  it("lists every project's domains once, with the projects that use each", async () => {
    const a = await setupProject({ allowedDomains: ["acme.com", "send.acme.com"] });
    const b = await setupProject({ allowedDomains: ["acme.com"], defaultFrom: "B <b@acme.com>" });
    await call("DELETE", `/v1/admin/projects/${b.slug}`, { key: ADMIN_KEY });
    const r = await json(call("GET", "/v1/admin/domains", { key: ADMIN_KEY }));
    const acme = r.data.find((d: { domain: string }) => d.domain === "acme.com");
    expect(r.data.filter((d: { domain: string }) => d.domain === "acme.com")).toHaveLength(1);
    expect(acme.projects).toEqual(
      expect.arrayContaining([
        { slug: a.slug, name: "Test project", paused: false, defaultFrom: "Acme <hello@acme.com>" },
        { slug: b.slug, name: "Test project", paused: true, defaultFrom: "B <b@acme.com>" },
      ]),
    );
    const send = r.data.find((d: { domain: string }) => d.domain === "send.acme.com");
    expect(send.projects.some((x: { slug: string }) => x.slug === b.slug)).toBe(false);
    expect((await call("GET", "/v1/admin/domains", { key: a.liveKey })).status).toBe(401);
  });
  it("lists projects and stats", async () => {
    const p = await setupProject();
    const list = await json(call("GET", "/v1/admin/projects", { key: ADMIN_KEY }));
    expect(list.data.some((x: any) => x.slug === p.slug)).toBe(true);
    const stats = await json(call("GET", "/v1/admin/stats", { key: ADMIN_KEY }));
    expect(stats.data.find((s: any) => s.slug === p.slug)).toMatchObject({ today: {}, last7d: {}, last30d: {} });
  });
});

describe("admin suppressions", () => {
  it("adds, lists and removes with the Cloudflare note", async () => {
    const address = `${uniq("s")}@example.com`;
    const added = await json(call("POST", "/v1/admin/suppressions", { key: ADMIN_KEY, body: { address: address.toUpperCase() } }));
    expect(added).toMatchObject({ address, reason: "manual" });
    expect(added.note).toContain("Cloudflare");
    const list = await json(call("GET", `/v1/admin/suppressions?q=${address}`, { key: ADMIN_KEY }));
    expect(list.data.map((s: any) => s.address)).toEqual([address]);
    const del = await json(call("DELETE", `/v1/admin/suppressions/${encodeURIComponent(address)}`, { key: ADMIN_KEY }));
    expect(del).toMatchObject({ address, deleted: true });
  });
});

describe("misc", () => {
  it("unknown routes return the error shape", async () => {
    const r = await call("GET", "/nope");
    expect(r.status).toBe(404);
    expect((await json(r)).error.code).toBe("route_not_found");
  });
  it("invalid JSON body -> 400 invalid_body", async () => {
    const p = await setupProject();
    const r = await call("POST", "/v1/emails", { key: p.liveKey, rawBody: "{nope", headers: { "Content-Type": "application/json" } });
    expect(r.status).toBe(400);
    expect((await json(r)).error.code).toBe("invalid_body");
  });
  it("missing body -> 400 missing_body", async () => {
    const p = await setupProject();
    expect((await json(call("POST", "/v1/emails", { key: p.liveKey }))).error.code).toBe("missing_body");
  });
  it("dev events endpoint is disabled in production", async () => {
    const prod = { ...env, ENVIRONMENT: "production" } as Env;
    const { default: worker } = await import("../../src/index");
    const { createExecutionContext } = await import("cloudflare:test");
    const r = await worker.fetch(
      new Request("https://mailer.test/v1/admin/dev/events", { method: "POST", headers: { Authorization: `Bearer ${ADMIN_KEY}` }, body: "{}" }),
      prod,
      createExecutionContext(),
    );
    expect(r.status).toBe(404);
  });
});

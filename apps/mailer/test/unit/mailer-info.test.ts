import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMailerInfoCache, getMailerInfo } from "../../src/core/mailer-info";

const cfEnv = { CF_API_TOKEN: "tok", CF_ACCOUNT_ID: "acct" } as unknown as Env;

/** A fake Cloudflare API with the given custom domains and workers.dev setting. */
function fakeCf(domains: Array<{ hostname: string; enabled?: boolean }>, workersDev: boolean) {
  const ok = (result: unknown) => new Response(JSON.stringify({ success: true, errors: [], result }));
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const path = new URL(url).pathname + new URL(url).search;
    if (path === "/client/v4/accounts/acct/workers/domains?service=flaresend") return ok(domains);
    if (path === "/client/v4/accounts/acct/workers/scripts/flaresend/subdomain") return ok({ enabled: workersDev, previews_enabled: false });
    if (path === "/client/v4/accounts/acct/workers/subdomain") return ok({ subdomain: "acme-co" });
    return new Response(JSON.stringify({ success: false, errors: [{ message: "unexpected " + path }] }), { status: 404 });
  });
}

describe("getMailerInfo", () => {
  beforeEach(() => clearMailerInfoCache());

  it("lists custom domains first, then workers.dev, and skips disabled domains", async () => {
    const f = fakeCf([{ hostname: "mailer.acme.com" }, { hostname: "old.acme.com", enabled: false }], true);
    const info = await getMailerInfo(cfEnv, f as unknown as typeof fetch);
    expect(info.urls).toEqual([
      { url: "https://mailer.acme.com", kind: "custom_domain" },
      { url: "https://flaresend.acme-co.workers.dev", kind: "workers_dev" },
    ]);
    expect(f.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: "Bearer tok" } });
  });

  it("leaves out workers.dev when it is turned off", async () => {
    const info = await getMailerInfo(cfEnv, fakeCf([{ hostname: "mailer.acme.com" }], false) as unknown as typeof fetch);
    expect(info.urls).toEqual([{ url: "https://mailer.acme.com", kind: "custom_domain" }]);
  });

  it("caches for a minute", async () => {
    const f = fakeCf([], true);
    await getMailerInfo(cfEnv, f as unknown as typeof fetch, 1_000);
    const calls = f.mock.calls.length;
    await getMailerInfo(cfEnv, f as unknown as typeof fetch, 30_000);
    expect(f.mock.calls.length).toBe(calls);
    await getMailerInfo(cfEnv, f as unknown as typeof fetch, 62_000);
    expect(f.mock.calls.length).toBeGreaterThan(calls);
  });

  it("fails with a clear code when the token, account id or permission is missing", async () => {
    const f = fakeCf([], true);
    await expect(getMailerInfo({ CF_ACCOUNT_ID: "acct" } as unknown as Env, f as unknown as typeof fetch)).rejects.toMatchObject({ code: "cf_token_missing" });
    await expect(getMailerInfo({ CF_API_TOKEN: "tok" } as unknown as Env, f as unknown as typeof fetch)).rejects.toMatchObject({ code: "cf_account_missing" });
    const denied = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: "Authentication error" }] }), { status: 403 }));
    await expect(getMailerInfo(cfEnv, denied as unknown as typeof fetch)).rejects.toMatchObject({ code: "cf_api_error" });
  });
});

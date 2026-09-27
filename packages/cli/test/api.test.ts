import { describe, expect, it } from "vitest";
import { FlaresendError } from "@flaresend/types";
import { Api, CliError, buildUrl } from "../src/api";

type Seen = Array<{ url: string; init: RequestInit }>;

function fakeFetch(status: number, body: string, seen: Seen = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
}

describe("Api", () => {
  it("sends auth, JSON body and query params", async () => {
    const seen: Seen = [];
    const api = new Api({ baseUrl: "http://x.test/", token: "k", fetch: fakeFetch(200, '{"ok":true}', seen) });
    expect(await api.request("POST", "/v1/a", { body: { a: 1 }, query: { p: "s", n: undefined } })).toEqual({ ok: true });
    expect(seen[0]!.url).toBe("http://x.test/v1/a?p=s");
    const h = seen[0]!.init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer k");
    expect(h["content-type"]).toBe("application/json");
    expect(seen[0]!.init.body).toBe('{"a":1}');
  });

  it("throws FlaresendError from the error body", async () => {
    const body = '{"error":{"type":"permission_error","code":"invalid_sender","message":"nope","param":"from"}}';
    const api = new Api({ baseUrl: "http://x.test", token: "k", fetch: fakeFetch(403, body) });
    const err = await api.get("/v1/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FlaresendError);
    expect(err).toMatchObject({ code: "invalid_sender", status: 403, param: "from" });
  });

  it("throws FlaresendError for a non-JSON error", async () => {
    const api = new Api({ baseUrl: "http://x.test", token: "k", fetch: fakeFetch(502, "Bad Gateway") });
    const err = await api.get("/v1/x").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "http_502", type: "internal_error", status: 502 });
  });

  it("turns network failures into CliError", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    }) as unknown as typeof fetch;
    const err = await new Api({ baseUrl: "http://127.0.0.1:9", token: "k", fetch: failing }).get("/v1/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as Error).message).toBe("could not reach http://127.0.0.1:9 (ECONNREFUSED)");
  });

  it("buildUrl keeps a base path", () => {
    expect(buildUrl("https://h.test/mailer/", "/v1/x", { a: 1 })).toBe("https://h.test/mailer/v1/x?a=1");
  });
});

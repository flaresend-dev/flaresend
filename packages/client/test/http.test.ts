import { describe, expect, it } from "vitest";
import { Flaresend, FlaresendError } from "../src/index";
import { buildQuery, parseRetryAfter } from "../src/http";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = Response | Error | (() => Response);

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function setup(replies: Reply[], opts: { maxRetries?: number } = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string>) },
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const next = replies.shift();
    if (!next) throw new Error("no more fake replies");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  };
  const mail = new Flaresend({
    apiKey: "fs_test_abc",
    baseUrl: "https://mailer.test/",
    fetch: fakeFetch as typeof fetch,
    maxRetries: opts.maxRetries,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { mail, calls, sleeps };
}

const input = { from: "hi@app.test", to: "a@b.test", subject: "Hi", text: "hello" };

describe("Flaresend HTTP client", () => {
  it("requires apiKey and baseUrl", () => {
    expect(() => new Flaresend({ apiKey: "", baseUrl: "https://x.test" })).toThrow(/apiKey/);
    expect(() => new Flaresend({ apiKey: "k", baseUrl: "" })).toThrow(/baseUrl/);
  });

  it("sends with auth, JSON body and Idempotency-Key from opts", async () => {
    const { mail, calls } = setup([json(202, { id: "email_1", status: "queued" })]);
    const res = await mail.emails.send(input, { idempotencyKey: "key-1" });
    expect(res).toEqual({ id: "email_1", status: "queued" });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe("https://mailer.test/v1/emails");
    expect(c.method).toBe("POST");
    expect(c.headers.Authorization).toBe("Bearer fs_test_abc");
    expect(c.headers["Content-Type"]).toBe("application/json");
    expect(c.headers["Idempotency-Key"]).toBe("key-1");
    expect(c.body).toEqual(input);
  });

  it("uses input.idempotencyKey as the header when opts has none", async () => {
    const { mail, calls } = setup([json(202, { id: "email_1", status: "queued" })]);
    await mail.emails.send({ ...input, idempotencyKey: "from-body" });
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("from-body");
  });

  it("maps error bodies to FlaresendError with status and param", async () => {
    const { mail } = setup([
      json(403, { error: { type: "permission_error", code: "invalid_sender", message: "nope", param: "from" } }),
    ]);
    const err = await mail.emails.send(input).catch((e) => e);
    expect(err).toBeInstanceOf(FlaresendError);
    expect(err).toMatchObject({ type: "permission_error", code: "invalid_sender", message: "nope", param: "from", status: 403 });
  });

  it("maps non-JSON error bodies to internal_error http_<status>", async () => {
    const { mail } = setup([new Response("<html>bad gateway</html>", { status: 502 })], { maxRetries: 0 });
    const err = await mail.emails.get("email_1").catch((e) => e);
    expect(err).toBeInstanceOf(FlaresendError);
    expect(err).toMatchObject({ type: "internal_error", code: "http_502", status: 502 });
  });

  it("retries a GET on 503 then succeeds", async () => {
    const { mail, calls, sleeps } = setup([
      json(503, { error: { type: "internal_error", code: "internal", message: "down" } }),
      json(200, { id: "email_1" }),
    ]);
    const res = await mail.emails.get("email_1");
    expect(res).toEqual({ id: "email_1" });
    expect(calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
  });

  it("retries a send on 503 when an idempotency key is set", async () => {
    const { mail, calls } = setup([
      json(503, { error: { type: "internal_error", code: "internal", message: "down" } }),
      json(202, { id: "email_1", status: "queued" }),
    ]);
    await mail.emails.send(input, { idempotencyKey: "k" });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers["Idempotency-Key"]).toBe("k");
  });

  it("makes an idempotency key when none is passed and keeps it across retries", async () => {
    const { mail, calls } = setup([
      json(503, { error: { type: "internal_error", code: "internal", message: "down" } }),
      json(202, { id: "email_1", status: "queued" }),
    ]);
    await mail.emails.send(input);
    expect(calls).toHaveLength(2);
    const key = calls[0]!.headers["Idempotency-Key"];
    expect(key).toMatch(/^auto_/);
    expect(calls[1]!.headers["Idempotency-Key"]).toBe(key);
    expect(calls[0]!.body).toEqual(input);
  });

  it("makes a new key for each send call", async () => {
    const { mail, calls } = setup([json(202, { id: "email_1" }), json(202, { id: "email_2" })]);
    await mail.emails.send(input);
    await mail.emails.send(input);
    expect(calls[0]!.headers["Idempotency-Key"]).not.toBe(calls[1]!.headers["Idempotency-Key"]);
  });

  it("makes a batch key when none is passed", async () => {
    const { mail, calls } = setup([json(200, { data: [] })]);
    await mail.emails.sendBatch([input]);
    expect(calls[0]!.headers["Idempotency-Key"]).toMatch(/^auto_/);
  });

  it("does not retry a POST that has no idempotency key", async () => {
    const { mail, calls, sleeps } = setup([
      json(503, { error: { type: "internal_error", code: "internal", message: "down" } }),
      json(200, { id: "ct_1" }),
    ]);
    const err = await mail.contacts.create({ email: "a@b.test" } as never).catch((e) => e);
    expect(err).toBeInstanceOf(FlaresendError);
    expect(err.status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers["Idempotency-Key"]).toBeUndefined();
    expect(sleeps).toHaveLength(0);
  });

  it("does not retry a DELETE", async () => {
    const { mail, calls } = setup([json(500, { error: { type: "internal_error", code: "internal", message: "x" } })]);
    await expect(mail.emails.cancel("email_1")).rejects.toBeInstanceOf(FlaresendError);
    expect(calls).toHaveLength(1);
  });

  it("does not retry 4xx other than 429", async () => {
    const { mail, calls } = setup([json(404, { error: { type: "not_found", code: "email_not_found", message: "x" } })]);
    await expect(mail.emails.get("nope")).rejects.toMatchObject({ code: "email_not_found", status: 404 });
    expect(calls).toHaveLength(1);
  });

  it("honours Retry-After on 429", async () => {
    const { mail, calls, sleeps } = setup([
      json(429, { error: { type: "rate_limit_error", code: "rate_limited", message: "slow" } }, { "Retry-After": "3" }),
      json(200, { data: [], nextCursor: null }),
    ]);
    await mail.emails.list();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([3000]);
  });

  it("gives up straight away when Retry-After is longer than 60 s", async () => {
    const { mail, calls } = setup([
      json(429, { error: { type: "rate_limit_error", code: "rate_limited", message: "slow" } }, { "Retry-After": "3600" }),
    ]);
    await expect(mail.emails.list()).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    expect(calls).toHaveLength(1);
  });

  it("does not retry daily_limit_exceeded", async () => {
    const { mail, calls } = setup([
      json(429, { error: { type: "rate_limit_error", code: "daily_limit_exceeded", message: "x" } }),
    ]);
    await expect(mail.emails.list()).rejects.toMatchObject({ code: "daily_limit_exceeded" });
    expect(calls).toHaveLength(1);
  });

  it("stops after maxRetries and throws the last error", async () => {
    const e503 = () => json(503, { error: { type: "internal_error", code: "internal", message: "down" } });
    const { mail, calls, sleeps } = setup([e503(), e503(), e503(), e503()], { maxRetries: 2 });
    await expect(mail.emails.get("x")).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
  });

  it("turns network failures into network_error after retries", async () => {
    const { mail, calls } = setup([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")]);
    const err = await mail.me().catch((e) => e);
    expect(err).toBeInstanceOf(FlaresendError);
    expect(err).toMatchObject({ type: "internal_error", code: "network_error" });
    expect(calls).toHaveLength(3);
  });

  it("builds the list query string and skips empty values", async () => {
    const { mail, calls } = setup([json(200, { data: [], nextCursor: null })]);
    await mail.emails.list({ limit: 10, status: "delivered", tag: "kind:welcome", q: "", cursor: undefined, to: "a@b.test" });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/emails");
    expect(url.search).toBe("?limit=10&status=delivered&tag=kind%3Awelcome&to=a%40b.test");
  });

  it("encodes path params", async () => {
    const { mail, calls } = setup([json(200, { name: "a/b" })]);
    await mail.templates.get("a/b c");
    expect(calls[0]!.url).toBe("https://mailer.test/v1/templates/a%2Fb%20c");
  });

  it("sendBatch passes dryRun and the batch idempotency key", async () => {
    const { mail, calls } = setup([json(200, { dryRun: true, data: [] })]);
    const res = await mail.emails.sendBatch([input], { dryRun: true, idempotencyKey: "b1" });
    expect(res.dryRun).toBe(true);
    expect(calls[0]!.url).toBe("https://mailer.test/v1/emails/batch?dryRun=true");
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("b1");
    expect(calls[0]!.body).toEqual([input]);
  });

  it("unwraps { data } for non-paginated lists", async () => {
    const { mail } = setup([json(200, { data: [{ domain: "app.test" }] })]);
    expect(await mail.domains.list()).toEqual([{ domain: "app.test" }]);
  });

  it("reschedule sends PATCH with scheduledAt", async () => {
    const { mail, calls } = setup([json(200, { id: "email_1" })]);
    await mail.emails.reschedule("email_1", "2026-10-01T10:00:00Z");
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { scheduledAt: "2026-10-01T10:00:00Z" } });
  });

  it("removeContacts sends DELETE with a body", async () => {
    const { mail, calls } = setup([json(200, { removed: 2 })]);
    expect(await mail.audiences.removeContacts("aud_1", ["c1", "c2"])).toEqual({ removed: 2 });
    expect(calls[0]).toMatchObject({ method: "DELETE", url: "https://mailer.test/v1/audiences/aud_1/contacts", body: { contactIds: ["c1", "c2"] } });
  });
});

describe("helpers", () => {
  it("buildQuery", () => {
    expect(buildQuery(undefined)).toBe("");
    expect(buildQuery({ a: undefined })).toBe("");
    expect(buildQuery({ a: 1, b: true, c: "x y" })).toBe("?a=1&b=true&c=x+y");
  });

  it("parseRetryAfter reads seconds and HTTP dates", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("2")).toBe(2000);
    const now = Date.parse("2026-09-25T00:00:00Z");
    expect(parseRetryAfter("Fri, 25 Sep 2026 00:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter("garbage")).toBeNull();
  });
});

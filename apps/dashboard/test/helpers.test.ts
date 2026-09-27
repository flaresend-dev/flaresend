import { describe, expect, it, vi } from "vitest";
import { encodeRpcError, senderForDomain, type DomainRecord } from "@flaresend/types";
import { csvToContacts, parseCsv } from "../src/lib/csv";
import { statusTone } from "../src/lib/labels";
import { formatUiError, toUiError } from "../src/lib/errors";
import { buildUrl, createHttpAdminClient } from "../src/lib/mailer-http";
import { accessMode } from "../src/lib/access";
import { summarizeStats } from "../src/lib/stats";
import { toEmailQuery, withParams } from "../src/lib/email-query";
import { renderMustache } from "../src/lib/mustache";
import { examplesFromVariables, parseExample } from "../src/lib/template-vars";
import { localInputToIso, pct } from "../src/lib/format";
import { sendableDomains } from "../src/lib/senders";

describe("parseCsv / csvToContacts", () => {
  it("handles quotes, escaped quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
  });
  it("handles newlines inside quotes, BOM and blank lines", () => {
    expect(parseCsv('﻿a\n"1\n2"\n\n')).toEqual([["a"], ["1\n2"]]);
  });
  it("maps known columns, puts the rest in data, and reports bad rows", () => {
    const r = csvToContacts("Email,First Name,last_name,unsubscribed,Company\nADA@Example.com,Ada,Lovelace,yes,Analytical\nnot-an-email,x,y,,\n");
    expect(r.contacts).toEqual([
      { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", unsubscribed: true, data: { company: "Analytical" } },
    ]);
    expect(r.errors).toEqual([{ line: 3, message: 'invalid email "not-an-email"' }]);
  });
  it("requires an email column", () => {
    expect(csvToContacts("name\nAda").errors[0]?.message).toMatch(/no email column/);
  });
});

describe("statusTone", () => {
  it("maps statuses and event types", () => {
    expect(statusTone("delivered")).toBe("success");
    expect(statusTone("email.bounced")).toBe("danger");
    expect(statusTone("deferred")).toBe("warning");
    expect(statusTone("scheduled")).toBe("info");
    expect(statusTone("canceled")).toBe("muted");
    expect(statusTone("something-new")).toBe("neutral");
    expect(statusTone(null)).toBe("muted");
  });
});

describe("toUiError", () => {
  it("decodes a FlaresendError carried in an RPC error message", () => {
    const err = new Error("RPC failed: " + encodeRpcError({ type: "conflict", code: "not_cancelable", message: "email is sent", param: "id" }));
    const ui = toUiError(err);
    expect(ui).toEqual({ code: "not_cancelable", message: "email is sent", param: "id" });
    expect(formatUiError(ui)).toBe("not_cancelable: email is sent (id)");
  });
  it("falls back to internal_error for plain errors", () => {
    expect(toUiError(new Error("boom"))).toEqual({ code: "internal_error", message: "boom" });
    expect(toUiError("x")).toEqual({ code: "internal_error", message: "x" });
  });
});

describe("HTTP fallback", () => {
  it("builds admin URLs and drops empty params", () => {
    expect(buildUrl("http://localhost:8787/", "/emails", { project: "acme", status: "", cursor: undefined, limit: 50 })).toBe(
      "http://localhost:8787/v1/admin/emails?project=acme&limit=50",
    );
    expect(buildUrl("https://mailer.example.com", "/suppressions/a%40b.com")).toBe("https://mailer.example.com/v1/admin/suppressions/a%40b.com");
  });

  it("routes cancelEmail through the project-scoped route and decodes API errors", async () => {
    const calls: Array<{ method: string; url: string; body?: string }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url, body: init?.body as string | undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (url.endsWith("/v1/admin/emails/email_1")) return json({ id: "email_1", projectId: "proj_1" });
      if (url.endsWith("/v1/admin/projects")) return json({ data: [{ id: "proj_1", slug: "acme" }] });
      if (url.endsWith("/v1/admin/projects/acme/emails/email_1") && init?.method === "DELETE") return json({ id: "email_1", status: "canceled" });
      if (url.endsWith("/v1/admin/projects/acme/emails/email_1") && init?.method === "PATCH") {
        return json({ error: { type: "conflict", code: "not_reschedulable", message: "already sent" } }, 409);
      }
      return json({ error: { type: "not_found", code: "not_found", message: url } }, 404);
    });
    const api = createHttpAdminClient("http://mailer.test", "secret", fetchMock);
    await expect(api.cancelEmail("email_1")).resolves.toEqual({ id: "email_1", status: "canceled" });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET http://mailer.test/v1/admin/emails/email_1",
      "GET http://mailer.test/v1/admin/projects",
      "DELETE http://mailer.test/v1/admin/projects/acme/emails/email_1",
    ]);
    const err = await api.rescheduleEmail("email_1", "2030-01-01T00:00:00.000Z").catch((e) => e);
    expect(toUiError(err)).toEqual({ code: "not_reschedulable", message: "already sent" });
    expect(calls.at(-1)?.body).toBe(JSON.stringify({ scheduledAt: "2030-01-01T00:00:00.000Z" }));
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer secret" });
  });

  it("unwraps { data } list responses and reports unreachable mailers", async () => {
    const ok = createHttpAdminClient("http://m", "k", async () => new Response(JSON.stringify({ data: [{ slug: "a" }] })));
    await expect(ok.listProjects()).resolves.toEqual([{ slug: "a" }]);
    const down = createHttpAdminClient("http://m", "k", async () => {
      throw new TypeError("fetch failed");
    });
    expect(toUiError(await down.stats().catch((e) => e)).code).toBe("mailer_unreachable");
  });
});

describe("accessMode", () => {
  it("verifies when configured, skips in dev, refuses in production", () => {
    expect(accessMode("aud", "https://team.cloudflareaccess.com/", "production")).toEqual({ kind: "verify", aud: "aud", teamDomain: "team.cloudflareaccess.com" });
    expect(accessMode("", "", "development")).toEqual({ kind: "skip" });
    expect(accessMode("", "team.cloudflareaccess.com", "production")).toEqual({ kind: "misconfigured" });
  });
});

describe("summarizeStats", () => {
  it("excludes test/canceled/scheduled from sent and computes delivered rate", () => {
    const s = summarizeStats({ delivered: 8, bounced: 1, failed: 1, rejected: 1, test: 5, scheduled: 2, queued: 1 });
    expect(s.sent).toBe(12);
    expect(s.deliveredRate).toBeCloseTo(8 / 12);
    expect(s.failed).toBe(2);
    expect(summarizeStats({}).deliveredRate).toBeNull();
  });
});

describe("email query", () => {
  it("turns search params into a list query", () => {
    expect(toEmailQuery({ status: "bounced", since: "2026-09-01", until: "bad", tag: "nocolon", q: " hi ", project: "x" })).toEqual({
      limit: 50, project: "x", status: "bounced", since: "2026-09-01T00:00:00.000Z", q: "hi",
    });
    expect(toEmailQuery({ project: "ignored" }, { project: "fixed" }).project).toBe("fixed");
  });
  it("keeps filters when paging", () => {
    expect(withParams("/emails", { status: "sent", cursor: "a" }, { cursor: "b" })).toBe("/emails?status=sent&cursor=b");
    expect(withParams("/emails", { cursor: "a" }, { cursor: null })).toBe("/emails");
  });
});

describe("template helpers", () => {
  it("renders the mailer's mustache subset", () => {
    const r = renderMustache("Hi {{name}} {{{raw}}}{{#if vip}}!{{else}}.{{/if}}{{#each items}}[{{@index}}:{{this}}]{{/each}}", {
      name: "<Ada>", raw: "<b>", vip: false, items: ["a", "b"],
    });
    expect(r).toEqual({ out: "Hi &lt;Ada&gt; <b>.[0:a][1:b]", error: null });
    expect(renderMustache("{{#if x}}", {}).error).toMatch(/unclosed/);
  });
  it("builds example data", () => {
    expect(examplesFromVariables([{ name: "user.name", example: "Ada" }, { name: "n", example: 3 }, { name: "none" }])).toEqual({ user: { name: "Ada" }, n: 3 });
    expect(parseExample("42")).toBe(42);
    expect(parseExample("Ada")).toBe("Ada");
    expect(parseExample("  ")).toBeUndefined();
  });
});

describe("format", () => {
  it("formats rates and datetime-local input", () => {
    expect(pct(0.9876)).toBe("98.8%");
    expect(pct(null)).toBe("-");
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("2030-01-02T03:04")).toMatch(/^2030-01-0\dT\d\d:04:00\.000Z$/);
  });
});

describe("senders", () => {
  const d = (domain: string, verification: DomainRecord["verification"]): DomainRecord => ({ domain, verification, defaultFrom: null });
  it("offers onboarded domains only, or every domain when none could be checked", () => {
    expect(sendableDomains([d("a.com", "onboarded"), d("b.com", "pending"), d("c.com", "unknown")])).toEqual({ domains: [d("a.com", "onboarded")], unchecked: false });
    expect(sendableDomains([d("a.com", "pending"), d("b.com", "unknown")])).toEqual({ domains: [], unchecked: false });
    expect(sendableDomains([d("a.com", "unknown"), d("b.com", "unknown")])).toEqual({ domains: [d("a.com", "unknown"), d("b.com", "unknown")], unchecked: true });
    expect(sendableDomains([])).toEqual({ domains: [], unchecked: false });
  });
  it("uses the domain's own sender, else the project default on that domain", () => {
    const p = { defaultFrom: "Acme <hello@acme.com>", domainSenders: { "send.acme.com": "Alerts <alerts@send.acme.com>" } };
    expect(senderForDomain(p, "send.acme.com")).toBe("Alerts <alerts@send.acme.com>");
    expect(senderForDomain(p, "acme.com")).toBe("Acme <hello@acme.com>");
    expect(senderForDomain(p, "other.dev")).toBeNull();
    expect(senderForDomain({ defaultFrom: null, domainSenders: {} }, "acme.com")).toBeNull();
  });
});

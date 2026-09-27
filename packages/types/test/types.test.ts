import { describe, expect, it } from "vitest";
import {
  parseDisplayAddress, formatDisplayAddress, SendEmailInput, ListEmailsQuery,
  FlaresendError, encodeRpcError, decodeRpcError,
} from "../src";

describe("parseDisplayAddress", () => {
  it("parses a bare address and lowercases it", () => {
    expect(parseDisplayAddress("Hello@Acme.COM")).toEqual({ address: "hello@acme.com", name: null });
  });
  it("parses Name <addr>", () => {
    expect(parseDisplayAddress("Acme <hello@acme.com>")).toEqual({ address: "hello@acme.com", name: "Acme" });
  });
  it("parses quoted names with commas and escaped quotes", () => {
    expect(parseDisplayAddress('"Doe, Jane \\"JD\\"" <jane@x.com>')).toEqual({ address: "jane@x.com", name: 'Doe, Jane "JD"' });
  });
  it("parses <addr> with no name", () => {
    expect(parseDisplayAddress("<a@b.co>")).toEqual({ address: "a@b.co", name: null });
  });
  it.each(["nope", "a@b", "Name <>", "Name <a@b.c", "a b@c.com", "@x.com", "x@.com", "Name <a@b.com> trailing"])(
    "rejects %s",
    (bad) => expect(() => parseDisplayAddress(bad)).toThrow(),
  );
  it("rejects newlines in names (header injection)", () => {
    expect(() => parseDisplayAddress("Evil\r\nBcc: x@y.com <a@b.com>")).toThrow();
  });
  it("round-trips through formatDisplayAddress", () => {
    const f = formatDisplayAddress({ address: "a@b.com", name: "Doe, Jane" });
    expect(f).toBe('"Doe, Jane" <a@b.com>');
    expect(parseDisplayAddress(f)).toEqual({ address: "a@b.com", name: "Doe, Jane" });
  });
});

describe("SendEmailInput", () => {
  const base = { from: "a@b.com", to: "c@d.com" };
  it("requires one of html, text or template", () => {
    const r = SendEmailInput.safeParse({ ...base, subject: "hi" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/html, text or template/);
  });
  it("requires subject unless template is set", () => {
    const r = SendEmailInput.safeParse({ ...base, text: "x" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["subject"]);
    expect(SendEmailInput.safeParse({ ...base, template: "welcome" }).success).toBe(true);
  });
  it("accepts a normal email", () => {
    expect(SendEmailInput.safeParse({ ...base, subject: "hi", text: "x" }).success).toBe(true);
  });
  it("caps recipient arrays at 50", () => {
    const to = Array.from({ length: 51 }, (_, i) => `u${i}@d.com`);
    expect(SendEmailInput.safeParse({ ...base, to, subject: "s", text: "t" }).success).toBe(false);
    expect(SendEmailInput.safeParse({ ...base, to: to.slice(0, 50), subject: "s", text: "t" }).success).toBe(true);
  });
  it("rejects an empty to array", () => {
    expect(SendEmailInput.safeParse({ ...base, to: [], subject: "s", text: "t" }).success).toBe(false);
  });
  it("defaults attachment disposition to attachment", () => {
    const r = SendEmailInput.parse({ ...base, subject: "s", text: "t", attachments: [{ filename: "a.txt", content: "YQ==" }] });
    expect(r.attachments?.[0]?.disposition).toBe("attachment");
  });
  it("rejects a subject over 998 chars", () => {
    expect(SendEmailInput.safeParse({ ...base, subject: "x".repeat(999), text: "t" }).success).toBe(false);
  });
});

describe("ListEmailsQuery", () => {
  it("coerces and defaults limit", () => {
    expect(ListEmailsQuery.parse({}).limit).toBe(25);
    expect(ListEmailsQuery.parse({ limit: "10" }).limit).toBe(10);
    expect(ListEmailsQuery.safeParse({ limit: "101" }).success).toBe(false);
  });
  it("validates tag format", () => {
    expect(ListEmailsQuery.safeParse({ tag: "plan:pro" }).success).toBe(true);
    expect(ListEmailsQuery.safeParse({ tag: "plan" }).success).toBe(false);
  });
});

describe("FlaresendError RPC encoding", () => {
  it("round-trips through an Error message", () => {
    const err = new Error(encodeRpcError({ type: "permission_error", code: "invalid_sender", message: "nope", param: "from" }));
    const back = decodeRpcError(err);
    expect(back).toBeInstanceOf(FlaresendError);
    expect(back?.status).toBe(403);
    expect(back?.code).toBe("invalid_sender");
    expect(back?.param).toBe("from");
  });
  it("returns null for unrelated errors", () => {
    expect(decodeRpcError(new Error("boom"))).toBeNull();
  });
});

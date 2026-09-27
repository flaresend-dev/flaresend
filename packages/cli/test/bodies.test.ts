import { describe, expect, it } from "vitest";
import { CreateProjectInput, SendEmailInput } from "@flaresend/types";
import { buildCreateProjectBody, buildSendRequest, buildUpdateProjectBody, collectList, splitList, type SendOptions } from "../src/bodies";

const noFile = (): string => {
  throw new Error("ENOENT: no such file");
};

describe("splitList", () => {
  it("splits on commas but not inside quotes or <>", () => {
    expect(splitList('a@x.com, "Doe, J" <j@x.com>,, b@y.com ')).toEqual(["a@x.com", '"Doe, J" <j@x.com>', "b@y.com"]);
  });
  it("collectList merges repeated flags", () => {
    expect(collectList("c@z.com", collectList("a@x.com,b@y.com", undefined))).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
  });
});

describe("buildSendRequest", () => {
  it("maps a basic text send", () => {
    const r = buildSendRequest({ from: "Acme <hello@acme.com>", to: ["a@x.com"], subject: "Hi", text: "Hello" }, noFile);
    expect(r).toEqual({ body: { from: "Acme <hello@acme.com>", to: "a@x.com", subject: "Hi", text: "Hello" }, headers: {} });
    expect(SendEmailInput.safeParse(r.body).success).toBe(true);
  });

  it("maps every option", () => {
    const r = buildSendRequest(
      {
        to: ["a@x.com", "b@x.com"],
        cc: ["c@x.com"],
        bcc: ["d@x.com", "e@x.com"],
        replyTo: "r@x.com",
        subject: "S",
        text: "T",
        htmlFile: "mail.html",
        tag: ["user=42", "kind=a=b"],
        idempotencyKey: "abc",
        scheduledAt: "2030-01-01T10:00:00+02:00",
        project: "ignored",
      },
      (p) => `<p>${p}</p>`,
    );
    expect(r.body).toEqual({
      to: ["a@x.com", "b@x.com"],
      cc: "c@x.com",
      bcc: ["d@x.com", "e@x.com"],
      replyTo: "r@x.com",
      subject: "S",
      text: "T",
      html: "<p>mail.html</p>",
      tags: { user: "42", kind: "a=b" },
      scheduledAt: "2030-01-01T08:00:00.000Z",
    });
    expect(r.headers).toEqual({ "Idempotency-Key": "abc" });
    expect(SendEmailInput.safeParse(r.body).success).toBe(true);
  });

  it("allows a template without subject and parses --data", () => {
    const r = buildSendRequest({ to: ["a@x.com"], template: "welcome", data: '{"name":"Ada"}' }, noFile);
    expect(r.body).toEqual({ to: "a@x.com", template: "welcome", data: { name: "Ada" } });
  });

  const bad: Array<[SendOptions, RegExp]> = [
    [{ subject: "S", text: "T" }, /--to is required/],
    [{ to: ["a@x.com"], subject: "S" }, /one of --text/],
    [{ to: ["a@x.com"], text: "T" }, /--subject is required/],
    [{ to: ["a@x.com"], subject: "S", html: "<p/>", htmlFile: "f" }, /only one of --html/],
    [{ to: ["a@x.com"], subject: "S", text: "T", data: "{}" }, /--data needs --template/],
    [{ to: ["a@x.com"], template: "t", data: "nope" }, /valid JSON/],
    [{ to: ["a@x.com"], template: "t", data: "[1]" }, /JSON object/],
    [{ to: ["a@x.com"], subject: "S", text: "T", tag: ["bad"] }, /key=value/],
    [{ to: ["a@x.com"], subject: "S", text: "T", scheduledAt: "soon" }, /--scheduled-at/],
    [{ to: ["a@x.com"], subject: "S", htmlFile: "missing.html" }, /could not read --html-file/],
  ];
  it.each(bad)("rejects bad input %#", (opts, msg) => {
    expect(() => buildSendRequest(opts, noFile)).toThrow(msg);
  });
});

describe("buildCreateProjectBody", () => {
  it("maps required and optional flags", () => {
    const body = buildCreateProjectBody({
      slug: "acme",
      name: "Acme",
      domains: "Acme.com, mail.acme.com",
      defaultFrom: "Acme <hello@acme.com>",
      senders: "hello@acme.com,Support@acme.com",
      dailyLimit: "500",
      rpc: false,
    });
    expect(body).toEqual({
      slug: "acme",
      name: "Acme",
      allowedDomains: ["acme.com", "mail.acme.com"],
      defaultFrom: "Acme <hello@acme.com>",
      allowedSenders: ["hello@acme.com", "support@acme.com"],
      dailyLimit: 500,
      rpcEnabled: false,
    });
    expect(CreateProjectInput.safeParse(body).success).toBe(true);
  });

  it("leaves rpcEnabled out when no rpc flag is given", () => {
    expect(buildCreateProjectBody({ slug: "a", name: "A", domains: "a.com" })).toEqual({ slug: "a", name: "A", allowedDomains: ["a.com"] });
  });

  it("requires slug, name and domains, and a numeric limit", () => {
    expect(() => buildCreateProjectBody({ name: "A", domains: "a.com" })).toThrow(/--slug/);
    expect(() => buildCreateProjectBody({ slug: "a", domains: "a.com" })).toThrow(/--name/);
    expect(() => buildCreateProjectBody({ slug: "a", name: "A" })).toThrow(/--domains/);
    expect(() => buildCreateProjectBody({ slug: "a", name: "A", domains: "a.com", dailyLimit: "lots" })).toThrow(/whole number/);
  });
});

describe("buildUpdateProjectBody", () => {
  it("only sends what was passed, and empty strings clear", () => {
    expect(buildUpdateProjectBody({ name: "New", rpc: true })).toEqual({ name: "New", rpcEnabled: true });
    expect(buildUpdateProjectBody({ defaultFrom: "", senders: "" })).toEqual({ defaultFrom: null, allowedSenders: null });
  });
  it("refuses an empty update", () => {
    expect(() => buildUpdateProjectBody({})).toThrow(/nothing to update/);
  });
});

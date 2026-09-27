import { describe, expect, expectTypeOf, it } from "vitest";
import { attachmentFromBytes, Flaresend } from "../src/index";
import type { SendEmailResult, TypedSend } from "../src/index";

describe("attachmentFromBytes", () => {
  it("base64-encodes a Uint8Array", () => {
    const a = attachmentFromBytes("hi.txt", new TextEncoder().encode("hello"), "text/plain");
    expect(a).toEqual({ filename: "hi.txt", content: "aGVsbG8=", type: "text/plain", disposition: "attachment" });
  });

  it("accepts an ArrayBuffer and omits type when not given", () => {
    const buf = new Uint8Array([0, 1, 2, 255]).buffer;
    const a = attachmentFromBytes("b.bin", buf);
    expect(a.content).toBe("AAEC/w==");
    expect("type" in a).toBe(false);
  });

  it("handles inputs bigger than one chunk", () => {
    const big = new Uint8Array(200_000);
    for (let i = 0; i < big.length; i++) big[i] = i % 256;
    const decoded = atob(attachmentFromBytes("big", big).content);
    expect(decoded.length).toBe(big.length);
    for (let i = 0; i < big.length; i += 997) expect(decoded.charCodeAt(i)).toBe(big[i]);
  });
});

type Templates = {
  welcome: { name: string; loginUrl: string };
  "magic-link": { loginUrl: string; expiresInMinutes?: number };
};

describe("TypedSend", () => {
  it("ties data to the template name (compile-time)", () => {
    const ok: TypedSend<Templates> = { to: "a@b.test", template: "welcome", data: { name: "Ada", loginUrl: "https://x" } };
    const plain: TypedSend<Templates> = { to: "a@b.test", subject: "Hi", text: "hi" };
    // @ts-expect-error wrong data for welcome
    const bad: TypedSend<Templates> = { to: "a@b.test", template: "welcome", data: { loginUrl: "https://x" } };
    // @ts-expect-error unknown template
    const unknown: TypedSend<Templates> = { to: "a@b.test", template: "nope", data: {} };
    expect([ok, plain, bad, unknown]).toHaveLength(4);
  });

  it("emails.send accepts a template map type argument", () => {
    const mail = new Flaresend({ apiKey: "k", baseUrl: "https://x.test", fetch: (async () => new Response("{}")) as typeof fetch });
    const typed = () =>
      mail.emails.send<Templates>({ to: "a@b.test", template: "magic-link", data: { loginUrl: "https://x" } });
    // @ts-expect-error missing loginUrl
    const wrong = () => mail.emails.send<Templates>({ to: "a@b.test", template: "magic-link", data: {} });
    const untyped = () => mail.emails.send({ to: "a@b.test", template: "anything", data: { x: 1 } });
    expectTypeOf(typed).returns.resolves.toEqualTypeOf<SendEmailResult>();
    expect([typed, wrong, untyped]).toHaveLength(3);
  });
});

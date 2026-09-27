import { describe, expect, it } from "vitest";
import { computeWebhookSignature, signWebhookPayload, verifyWebhookSignature } from "../src/webhooks";

const secret = "whsec_abcdefghijklmnopqrstuvwxyz012345";
const body = JSON.stringify({ id: "evt_1", type: "email.delivered", data: { emailId: "email_1" } });
const now = () => Math.floor(Date.now() / 1000);

describe("webhook signatures", () => {
  it("matches a plain HMAC-SHA256 over `${t}.${body}` with the whole secret as key", async () => {
    const t = 1_790_000_000;
    // Reference value from Node: createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")
    const expected = "9599112a67a996bf26a00a7361e25aff8ab64eaa4200cfe91b504b180bf5363d";
    expect(await computeWebhookSignature(secret, t, body)).toBe(expected);
    expect(await signWebhookPayload(secret, body, t)).toBe(`t=${t},v1=${expected}`);
  });

  it("round trips", async () => {
    const header = await signWebhookPayload(secret, body);
    expect(await verifyWebhookSignature(secret, header, body)).toBe(true);
    // Uint8Array body works too
    expect(await verifyWebhookSignature(secret, header, new TextEncoder().encode(body))).toBe(true);
  });

  it("rejects a bad signature, wrong secret or changed body", async () => {
    const header = await signWebhookPayload(secret, body);
    expect(await verifyWebhookSignature(secret, header, body + " ")).toBe(false);
    expect(await verifyWebhookSignature("whsec_other", header, body)).toBe(false);
    const tampered = header.replace(/v1=([0-9a-f])/, (_m, c: string) => `v1=${c === "0" ? "1" : "0"}`);
    expect(await verifyWebhookSignature(secret, tampered, body)).toBe(false);
  });

  it("rejects timestamps outside the tolerance, in both directions", async () => {
    const old = await signWebhookPayload(secret, body, now() - 301);
    expect(await verifyWebhookSignature(secret, old, body)).toBe(false);
    expect(await verifyWebhookSignature(secret, old, body, 600)).toBe(true);
    const future = await signWebhookPayload(secret, body, now() + 301);
    expect(await verifyWebhookSignature(secret, future, body)).toBe(false);
  });

  it("accepts any of several v1 entries (secret rotation)", async () => {
    const header = await signWebhookPayload(["whsec_old", secret], body);
    expect(header.match(/v1=/g)).toHaveLength(2);
    expect(await verifyWebhookSignature(secret, header, body)).toBe(true);
    expect(await verifyWebhookSignature("whsec_old", header, body)).toBe(true);
    expect(await verifyWebhookSignature("whsec_neither", header, body)).toBe(false);
  });

  it("rejects malformed headers without throwing", async () => {
    for (const h of ["", null, undefined, "garbage", "t=abc,v1=00", `t=${now()}`, "v1=" + "0".repeat(64)]) {
      expect(await verifyWebhookSignature(secret, h, body)).toBe(false);
    }
  });
});

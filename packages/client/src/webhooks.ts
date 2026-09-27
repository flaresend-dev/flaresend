/**
 * Webhook signing and verification with Web Crypto, so it runs in Node 18+, Workers and browsers.
 *
 * Header: `Flaresend-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]`
 * where hex = HMAC-SHA256(key = UTF-8 bytes of the whole secret string incl. "whsec_",
 *                          message = `${t}.${rawBody}`).
 * Several `v1` entries may be present while a secret is being rotated; any match is accepted.
 *
 * These functions are async because Web Crypto HMAC is async; a sync
 * verifyWebhookSignature is not possible with Web Crypto.
 */

export type WebhookBody = string | ArrayBuffer | Uint8Array;

const encoder = new TextEncoder();

function toBytes(body: WebhookBody): Uint8Array {
  if (typeof body === "string") return encoder.encode(body);
  return body instanceof Uint8Array ? body : new Uint8Array(body);
}

function toHex(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < u8.length; i++) out += u8[i]!.toString(16).padStart(2, "0");
  return out;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Flaresend: Web Crypto (globalThis.crypto.subtle) is not available in this runtime");
  return subtle;
}

/** Hex HMAC-SHA256 of `${timestamp}.${body}` keyed with the secret's UTF-8 bytes. */
export async function computeWebhookSignature(secret: string, timestamp: number, body: WebhookBody): Promise<string> {
  const subtle = getSubtle();
  const key = await subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prefix = encoder.encode(`${timestamp}.`);
  const bodyBytes = toBytes(body);
  const message = new Uint8Array(prefix.length + bodyBytes.length);
  message.set(prefix, 0);
  message.set(bodyBytes, prefix.length);
  return toHex(await subtle.sign("HMAC", key, message));
}

/**
 * Build a `Flaresend-Signature` header value. Pass several secrets to emit one `v1` per secret
 * (used during secret rotation). `timestamp` is unix seconds and defaults to now.
 */
export async function signWebhookPayload(
  secret: string | string[],
  body: WebhookBody,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const secrets = Array.isArray(secret) ? secret : [secret];
  const sigs = await Promise.all(secrets.map((s) => computeWebhookSignature(s, timestamp, body)));
  return [`t=${timestamp}`, ...sigs.map((s) => `v1=${s}`)].join(",");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a `Flaresend-Signature` header against the raw request body (the exact bytes received,
 * not re-serialised JSON). Returns false for a malformed header, a bad signature, or a timestamp
 * more than `toleranceSeconds` away from now. Never throws for bad input.
 */
export async function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null | undefined,
  rawBody: WebhookBody,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!secret || !signatureHeader) return false;

  let timestamp: number | null = null;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") {
      if (!/^\d+$/.test(v)) return false;
      timestamp = Number(v);
    } else if (k === "v1" && /^[0-9a-fA-F]{64}$/.test(v)) {
      candidates.push(v.toLowerCase());
    }
  }
  if (timestamp === null || candidates.length === 0) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) return false;

  const expected = await computeWebhookSignature(secret, timestamp, rawBody);
  let ok = false;
  // Check every candidate so timing does not reveal which one matched.
  for (const c of candidates) if (timingSafeEqualHex(c, expected)) ok = true;
  return ok;
}

// Same algorithm as verifyWebhookSignature in @flaresend/client:
// Flaresend-Signature: t=<unix seconds>,v1=<hex hmac-sha256(secret, t + "." + body)>
import { hmacSha256, toHex } from "../core/keys";
import { randomBase62 } from "../core/ids";

export function generateWebhookSecret(): string {
  return `whsec_${randomBase62(32)}`;
}

export async function computeSignature(secret: string, timestamp: number, body: string): Promise<string> {
  return toHex(await hmacSha256(secret, `${timestamp}.${body}`));
}

export async function signatureHeader(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${timestamp},v1=${await computeSignature(secret, timestamp, body)}`;
}

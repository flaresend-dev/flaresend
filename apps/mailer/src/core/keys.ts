import { randomBase62 } from "./ids";

export type KeyMode = "live" | "test";

export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hashKey(key: string): Promise<string> {
  return sha256Hex(key);
}

/** fs_live_<32 base62> / fs_test_<32 base62>. Only the prefix and the hash are stored. */
export async function generateApiKey(mode: KeyMode): Promise<{ key: string; prefix: string; hash: string }> {
  const key = `fs_${mode}_${randomBase62(32)}`;
  return { key, prefix: key.slice(0, 12), hash: await hashKey(key) };
}

export function looksLikeApiKey(s: string): boolean {
  return /^fs_(live|test)_[0-9A-Za-z]{32}$/.test(s);
}

/** Constant-time string compare (compares SHA-256 digests so lengths never leak). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < ua.length; i++) diff |= ua[i]! ^ ub[i]!;
  return diff === 0;
}

export async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

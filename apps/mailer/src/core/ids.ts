import { ulid } from "ulid";

export type IdPrefix = "email" | "proj" | "key" | "evt" | "rcpt" | "tmpl" | "wh" | "whd" | "ct" | "bc" | "aud" | "pub" | "post" | "rev" | "asset" | "nf" | "imp" | "lease" | "sub" | "nse" | "tag" | "guard" | "job" | "run" | "nr";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Uniform random base62 string (rejection sampling, no modulo bias). */
export function randomBase62(length: number): string {
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < 248) out += BASE62[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

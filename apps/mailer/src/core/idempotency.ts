import type { SendEmailResult } from "@flaresend/types";
import { getEmailByIdempotencyKey } from "../db/emails";
import { ApiError } from "../http/errors";
import { sha256Hex } from "./keys";

/** JSON with object keys sorted recursively, so logically equal inputs hash the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = sortKeys(val);
    }
    return out;
  }
  return v;
}

/** SHA-256 of the canonical JSON of the parsed input minus idempotencyKey. */
export function bodyHash(parsed: Record<string, unknown>): Promise<string> {
  const { idempotencyKey: _ignored, ...rest } = parsed;
  return sha256Hex(canonicalJson(rest));
}

export function publicStatus(status: string): SendEmailResult["status"] {
  if (status === "test") return "test";
  if (status === "scheduled" || status === "canceled") return "scheduled";
  return "queued";
}

/**
 * Step 8. Returns the original result when the key was used with the same body,
 * throws 409 when it was used with a different body, or returns null for a new key.
 */
export async function checkIdempotency(
  db: D1Database,
  projectId: string,
  key: string,
  hash: string,
): Promise<SendEmailResult | null> {
  const existing = await getEmailByIdempotencyKey(db, projectId, key);
  if (!existing) return null;
  if (existing.body_hash !== hash) {
    throw ApiError.conflict(
      "idempotency_payload_mismatch",
      "this Idempotency-Key was already used with a different request body",
      "idempotencyKey",
    );
  }
  return { id: existing.id, status: publicStatus(existing.status), idempotent: true };
}

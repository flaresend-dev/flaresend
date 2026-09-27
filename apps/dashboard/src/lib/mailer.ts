import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { encodeRpcError, type AdminRpcApi } from "@flaresend/types";
import { createHttpAdminClient } from "./mailer-http";
import { toUiError, type UiError } from "./errors";

export type Result<T> = { ok: true; data: T } | { ok: false; error: UiError };

function readVar(env: Record<string, unknown>, name: string): string | undefined {
  const v = env[name] ?? process.env[name];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Returns the admin API.
 *
 * - Production (and `opennextjs-cloudflare preview`): the MAILER_ADMIN service binding -> AdminRpc in the `flaresend` Worker.
 * - Local `next dev`: if MAILER_URL and MAILER_ADMIN_KEY are set, an HTTP client for /v1/admin/* is used instead,
 *   so you can point the dashboard at a mailer running under `wrangler dev` (or a deployed one) without a binding.
 *   The HTTP path is never chosen in production when the binding exists.
 */
export async function getMailer(): Promise<AdminRpcApi> {
  const { env } = await getCloudflareContext({ async: true });
  const vars = env as unknown as Record<string, unknown>;
  const binding = vars.MAILER_ADMIN as AdminRpcApi | undefined;
  const url = readVar(vars, "MAILER_URL");
  const key = readVar(vars, "MAILER_ADMIN_KEY");
  const isProd = process.env.NODE_ENV === "production";

  if (url && key && (!isProd || !binding)) return createHttpAdminClient(url, key);
  if (binding) return binding;
  throw new Error(encodeRpcError({
    type: "internal_error",
    code: "mailer_not_configured",
    message: "no MAILER_ADMIN service binding, and MAILER_URL + MAILER_ADMIN_KEY are not set",
  }));
}

/**
 * Results that come over the service binding can be RPC proxies (with `next dev` they go through Wrangler's local
 * proxy), which React refuses to pass to client components. Copy them into plain JSON data and release the RPC
 * handle. Every AdminRpcApi result is JSON-shaped (ISO date strings, no class instances), so nothing is lost.
 */
function toPlain<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const plain = JSON.parse(JSON.stringify(value)) as T;
  const dispose = (value as { [Symbol.dispose]?: () => void })[Symbol.dispose];
  if (typeof dispose === "function") {
    try {
      dispose.call(value);
    } catch {
      /* already released */
    }
  }
  return plain;
}

/** Runs one mailer call and converts a thrown error into `{ ok: false, error: { code, message } }`. */
export async function mailerCall<T>(fn: (m: AdminRpcApi) => Promise<T>): Promise<Result<T>> {
  try {
    const m = await getMailer();
    return { ok: true, data: toPlain(await fn(m)) };
  } catch (e) {
    return { ok: false, error: toUiError(e) };
  }
}

// Where the mailer is reachable, read from Cloudflare so it follows custom domains without config changes.
// Endpoints (checked against the live API on 2026-09-27; token needs Account > Workers Scripts > Read):
//   GET /accounts/{account_id}/workers/domains?service=<worker> -> custom domains: [{ hostname, enabled, ... }]
//   GET /accounts/{account_id}/workers/scripts/<worker>/subdomain -> { enabled }: is workers.dev on for this Worker
//   GET /accounts/{account_id}/workers/subdomain                -> { subdomain }: the account's workers.dev name
// Zone routes (`mailer.example.com/*` without custom_domain) are not listed by these endpoints.
import type { MailerInfo, MailerUrl } from "@flaresend/types";
import { MAILER_WORKER_NAME } from "../env";
import { ApiError } from "../http/errors";

const CF_API = "https://api.cloudflare.com/client/v4";
const TTL_MS = 60 * 1000;

let cached: { at: number; info: MailerInfo } | null = null;

async function cfGet<T>(env: Env, path: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${CF_API}${path}`, { headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } });
  const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: Array<{ message: string }> } | null;
  if (!res.ok || !json?.success) {
    const why = json?.errors?.map((e) => e.message).join("; ") ?? "";
    throw ApiError.unprocessable("cf_api_error", `Cloudflare API GET ${path.split("?")[0]} failed: ${res.status} ${why}`.trim());
  }
  return json.result as T;
}

/** The mailer's public URLs, custom domains first. Cached for a minute per isolate. */
export async function getMailerInfo(env: Env, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<MailerInfo> {
  if (cached && now - cached.at < TTL_MS) return cached.info;
  if (!env.CF_API_TOKEN) {
    throw ApiError.unprocessable("cf_token_missing", "the mailer has no CF_API_TOKEN secret, so it cannot look up its own URL");
  }
  if (!env.CF_ACCOUNT_ID) {
    throw ApiError.unprocessable("cf_account_missing", "the mailer has no CF_ACCOUNT_ID secret, so it cannot look up its own URL");
  }
  const acct = `/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/workers`;
  const worker = encodeURIComponent(MAILER_WORKER_NAME);

  const [domains, script] = await Promise.all([
    cfGet<Array<{ hostname: string; enabled?: boolean }>>(env, `${acct}/domains?service=${worker}`, fetchImpl),
    cfGet<{ enabled: boolean }>(env, `${acct}/scripts/${worker}/subdomain`, fetchImpl),
  ]);

  const urls: MailerUrl[] = domains
    .filter((d) => d.enabled !== false)
    .map((d) => ({ url: `https://${d.hostname}`, kind: "custom_domain" as const }))
    .sort((a, b) => a.url.localeCompare(b.url));
  if (script.enabled) {
    const { subdomain } = await cfGet<{ subdomain: string }>(env, `${acct}/subdomain`, fetchImpl);
    urls.push({ url: `https://${MAILER_WORKER_NAME}.${subdomain}.workers.dev`, kind: "workers_dev" });
  }

  const info: MailerInfo = { urls };
  cached = { at: now, info };
  return info;
}

/** Tests only. */
export function clearMailerInfoCache() {
  cached = null;
}

import type { MiddlewareHandler } from "hono";
import { getApiKeyByHash, touchApiKey } from "../db/api-keys";
import { getProjectById, getProjectBySlug } from "../db/projects";
import { hashKey, looksLikeApiKey, timingSafeEqual } from "../core/keys";
import { nowIso } from "../core/ids";
import type { AppEnv } from "./context";
import { ApiError } from "./errors";

const TOUCH_INTERVAL_MS = 60_000;

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1]!.trim() : null;
}

/** Bearer project key -> c.var.project / apiKey / mode. */
export const requireProject: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c.req.header("Authorization"));
  if (!token) throw ApiError.auth("missing_api_key", "missing API key; send Authorization: Bearer fs_live_...");
  if (!looksLikeApiKey(token)) throw ApiError.auth("invalid_api_key", "invalid API key");

  const key = await getApiKeyByHash(c.env.DB, await hashKey(token));
  if (!key) throw ApiError.auth("invalid_api_key", "invalid API key");
  if (key.revoked_at) throw ApiError.auth("revoked_api_key", "this API key has been revoked");
  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
    throw ApiError.auth("expired_api_key", "this API key has expired");
  }

  const project = await getProjectById(c.env.DB, key.project_id);
  if (!project) throw ApiError.auth("invalid_api_key", "invalid API key");
  if (project.disabled_at) throw ApiError.permission("project_disabled", "this project is disabled");

  c.set("project", project);
  c.set("apiKey", key);
  c.set("mode", key.mode);
  c.set("viaAdmin", false);

  // Update last_used_at at most once per 60 s per key, off the request path.
  const last = key.last_used_at ? new Date(key.last_used_at).getTime() : 0;
  if (Date.now() - last > TOUCH_INTERVAL_MS) {
    const p = touchApiKey(c.env.DB, key.id, nowIso()).catch((err) => console.error("touchApiKey failed", err));
    try {
      c.executionCtx.waitUntil(p);
    } catch {
      /* no execution context (tests) */
    }
  }
  await next();
};

export async function isAdminToken(env: Env, token: string | null): Promise<boolean> {
  if (!token || !env.ADMIN_API_KEY) return false;
  return timingSafeEqual(token, env.ADMIN_API_KEY);
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c.req.header("Authorization"));
  if (!token) throw ApiError.auth("missing_api_key", "missing admin key");
  if (!(await isAdminToken(c.env, token))) throw ApiError.auth("invalid_api_key", "invalid admin key");
  await next();
};

/** For /v1/admin/projects/:slug/* — resolves the project from the slug and acts as a live, key-less caller. */
export const adminProject: MiddlewareHandler<AppEnv> = async (c, next) => {
  const slug = c.req.param("slug");
  const project = slug ? await getProjectBySlug(c.env.DB, slug) : null;
  if (!project) throw ApiError.notFound("project_not_found", `project "${slug}" not found`, "slug");
  c.set("project", project);
  c.set("apiKey", null);
  c.set("mode", "live");
  c.set("viaAdmin", true);
  await next();
};

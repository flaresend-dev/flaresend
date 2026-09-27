import type { Context } from "hono";
import type { z, ZodTypeAny } from "zod";
import type { ApiKeyRow } from "../db/api-keys";
import type { ProjectRow } from "../db/projects";
import { ApiError } from "./errors";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    requestId: string;
    project: ProjectRow;
    apiKey: ApiKeyRow | null;
    mode: "live" | "test";
    /** true when the request came in through /v1/admin/projects/:slug/... */
    viaAdmin: boolean;
  };
}

export type AppContext = Context<AppEnv>;

export async function readJson(c: Context, opts: { optional?: boolean } = {}): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) {
    if (opts.optional) return {};
    throw ApiError.validation("missing_body", "request body is required");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw ApiError.validation("invalid_body", "request body is not valid JSON");
  }
}

export async function parseBody<S extends ZodTypeAny>(c: Context, schema: S, opts: { optional?: boolean } = {}): Promise<z.output<S>> {
  const raw = await readJson(c, opts);
  const r = schema.safeParse(raw);
  if (!r.success) throw ApiError.fromZod(r.error);
  return r.data;
}

export function parseQuery<S extends ZodTypeAny>(c: Context, schema: S): z.output<S> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw ApiError.fromZod(r.error, "invalid_query");
  return r.data;
}

/** Background work tied to the request lifetime. */
export function waitUntilOf(c: Context): (p: Promise<unknown>) => void {
  return (p) => {
    try {
      c.executionCtx.waitUntil(p);
    } catch {
      p.catch((err) => console.error("background task failed", err));
    }
  };
}

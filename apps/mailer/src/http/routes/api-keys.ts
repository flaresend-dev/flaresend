import { Hono } from "hono";
import { listApiKeys, toApiKeyRecord } from "../../db/api-keys";
import type { AppEnv } from "../context";

export const apiKeyRoutes = new Hono<AppEnv>()
  .get("/api-keys", async (c) => c.json({ data: (await listApiKeys(c.env.DB, c.var.project.id)).map(toApiKeyRecord) }))
  .get("/me", (c) => {
    const p = c.var.project;
    const k = c.var.apiKey!;
    return c.json({ project: { id: p.id, slug: p.slug, name: p.name }, key: { id: k.id, name: k.name, mode: k.mode } });
  });

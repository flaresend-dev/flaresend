import { Hono } from "hono";
import { getAnalytics } from "../../core/analytics";
import type { AppEnv } from "../context";

export const analyticsRoutes = new Hono<AppEnv>().get("/analytics", async (c) =>
  c.json(await getAnalytics(c.env, c.req.query(), c.var.project.id)),
);

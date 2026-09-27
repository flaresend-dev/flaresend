import { Hono } from "hono";
import { listEventRecords } from "../../core/emails";
import type { AppEnv } from "../context";

export const eventRoutes = new Hono<AppEnv>().get("/events", async (c) =>
  c.json(await listEventRecords(c.env, c.req.query(), c.var.project.id)),
);

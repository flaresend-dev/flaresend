import { Hono } from "hono";
import { listDomainRecords, setupDomain } from "../../core/domains";
import { ApiError } from "../errors";
import type { AppEnv } from "../context";

export const domainRoutes = new Hono<AppEnv>()
  .get("/domains", async (c) => {
    const refresh = ["1", "true"].includes(c.req.query("refresh") ?? "");
    return c.json({ data: await listDomainRecords(c.env, c.var.project, { refresh }) });
  })
  // Changes DNS and Email Sending with the mailer's CF_API_TOKEN, so project API keys can't call it.
  .post("/domains/:domain/setup", async (c) => {
    if (!c.var.viaAdmin) throw ApiError.permission("admin_only", "domain setup needs the admin key");
    return c.json(await setupDomain(c.env, c.var.project, c.req.param("domain")));
  });

import { Hono } from "hono";
import { RescheduleInput } from "@flaresend/types";
import { sendBatch } from "../../core/batch";
import {
  cancelEmail, getEmailContent, getEmailRecord, listEmailRecords, parseListEmailsQuery, rescheduleEmail,
} from "../../core/emails";
import { sendEmail, type SendContext } from "../../core/send";
import { parseBody, readJson, waitUntilOf, type AppContext, type AppEnv } from "../context";

export function sendContext(c: AppContext, source: SendContext["source"] = "http"): SendContext {
  return {
    project: c.var.project,
    mode: c.var.mode,
    source,
    apiKeyId: c.var.apiKey?.id ?? null,
    waitUntil: waitUntilOf(c),
  };
}

export const emailRoutes = new Hono<AppEnv>()
  .post("/emails", async (c) => {
    const body = await readJson(c);
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim() || undefined;
    const result = await sendEmail(c.env, sendContext(c), body, { idempotencyKey });
    const status = result.idempotent || result.status === "test" ? 200 : 202;
    return c.json(result, status);
  })
  .post("/emails/batch", async (c) => {
    const body = await readJson(c);
    const dryRun = ["1", "true"].includes(c.req.query("dryRun") ?? "");
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim() || undefined;
    return c.json(await sendBatch(c.env, sendContext(c, "batch"), body, { dryRun, idempotencyKey }));
  })
  .get("/emails", async (c) => {
    return c.json(await listEmailRecords(c.env, parseListEmailsQuery(c.req.query()), c.var.project.id));
  })
  .get("/emails/:id", async (c) => c.json(await getEmailRecord(c.env, c.req.param("id"), c.var.project.id)))
  .get("/emails/:id/content", async (c) => c.json(await getEmailContent(c.env, c.req.param("id"), c.var.project.id)))
  .delete("/emails/:id", async (c) => c.json(await cancelEmail(c.env, c.req.param("id"), c.var.project.id)))
  .patch("/emails/:id", async (c) => {
    const { scheduledAt } = await parseBody(c, RescheduleInput);
    return c.json(await rescheduleEmail(c.env, c.req.param("id"), scheduledAt, c.var.project.id));
  });

import { Hono } from "hono";
import {
  createWebhook, getWebhookRecord, listWebhookDeliveries, listWebhookRecords, patchWebhook, removeWebhook, rotateWebhookSecret, testWebhook,
} from "../../core/webhooks";
import { readJson, type AppEnv } from "../context";

export const webhookRoutes = new Hono<AppEnv>()
  .get("/webhooks", async (c) => c.json({ data: await listWebhookRecords(c.env, c.var.project.id) }))
  .post("/webhooks", async (c) => c.json(await createWebhook(c.env, c.var.project.id, await readJson(c)), 201))
  .get("/webhooks/:id", async (c) => c.json(await getWebhookRecord(c.env, c.var.project.id, c.req.param("id"))))
  .patch("/webhooks/:id", async (c) => c.json(await patchWebhook(c.env, c.var.project.id, c.req.param("id"), await readJson(c))))
  .delete("/webhooks/:id", async (c) => c.json(await removeWebhook(c.env, c.var.project.id, c.req.param("id"))))
  .post("/webhooks/:id/test", async (c) => c.json(await testWebhook(c.env, c.var.project.id, c.req.param("id")), 202))
  .post("/webhooks/:id/rotate-secret", async (c) => c.json(await rotateWebhookSecret(c.env, c.var.project.id, c.req.param("id"))))
  .get("/webhooks/:id/deliveries", async (c) =>
    c.json(await listWebhookDeliveries(c.env, c.var.project.id, c.req.param("id"), c.req.query())),
  );

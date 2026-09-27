import { Hono } from "hono";
import {
  cancelBroadcast, createBroadcast, getBroadcast, listBroadcasts, patchBroadcast, removeBroadcast, startBroadcast,
} from "../../core/broadcasts";
import { readJson, type AppEnv } from "../context";

export const broadcastRoutes = new Hono<AppEnv>()
  .get("/broadcasts", async (c) => c.json({ data: await listBroadcasts(c.env, c.var.project.id) }))
  .post("/broadcasts", async (c) => c.json(await createBroadcast(c.env, c.var.project, await readJson(c)), 201))
  .get("/broadcasts/:id", async (c) => c.json(await getBroadcast(c.env, c.var.project.id, c.req.param("id"))))
  .patch("/broadcasts/:id", async (c) => c.json(await patchBroadcast(c.env, c.var.project, c.req.param("id"), await readJson(c))))
  .delete("/broadcasts/:id", async (c) => c.json(await removeBroadcast(c.env, c.var.project.id, c.req.param("id"))))
  .post("/broadcasts/:id/send", async (c) =>
    c.json(await startBroadcast(c.env, c.var.project, c.req.param("id"), await readJson(c, { optional: true }))),
  )
  .post("/broadcasts/:id/cancel", async (c) => c.json(await cancelBroadcast(c.env, c.var.project.id, c.req.param("id"))));

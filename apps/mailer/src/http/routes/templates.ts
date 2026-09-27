import { Hono } from "hono";
import {
  createTemplate, getTemplateRecord, listTemplateRecords, listTemplateVersionRecords, patchTemplate, removeTemplate,
  renderTemplatePreview, restoreTemplate,
} from "../../core/templates";
import { readJson, type AppEnv } from "../context";

export const templateRoutes = new Hono<AppEnv>()
  .get("/templates", async (c) => c.json({ data: await listTemplateRecords(c.env, c.var.project.id) }))
  .post("/templates", async (c) => c.json(await createTemplate(c.env, c.var.project.id, await readJson(c)), 201))
  .get("/templates/:name", async (c) => c.json(await getTemplateRecord(c.env, c.var.project.id, c.req.param("name"))))
  .patch("/templates/:name", async (c) => c.json(await patchTemplate(c.env, c.var.project.id, c.req.param("name"), await readJson(c))))
  .delete("/templates/:name", async (c) => c.json(await removeTemplate(c.env, c.var.project.id, c.req.param("name"))))
  .get("/templates/:name/versions", async (c) => c.json({ data: await listTemplateVersionRecords(c.env, c.var.project.id, c.req.param("name")) }))
  .post("/templates/:name/restore", async (c) => c.json(await restoreTemplate(c.env, c.var.project.id, c.req.param("name"), await readJson(c))))
  .post("/templates/:name/render", async (c) =>
    c.json(await renderTemplatePreview(c.env, c.var.project.id, c.req.param("name"), await readJson(c, { optional: true }))),
  );

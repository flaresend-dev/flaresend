import { Hono } from "hono";
import {
  addAudienceContacts, createAudience, getAudience, getContact, importContacts, listAudienceContacts, listAudiences,
  listContacts, patchContact, removeAudience, removeAudienceContacts, removeContact, renameAudience, upsertContact,
} from "../../core/contacts";
import { readJson, type AppEnv } from "../context";

export const contactRoutes = new Hono<AppEnv>()
  .get("/contacts", async (c) => c.json(await listContacts(c.env, c.var.project.id, c.req.query())))
  .post("/contacts", async (c) => c.json(await upsertContact(c.env, c.var.project.id, await readJson(c)), 201))
  .post("/contacts/import", async (c) => c.json(await importContacts(c.env, c.var.project.id, await readJson(c))))
  .get("/contacts/:id", async (c) => c.json(await getContact(c.env, c.var.project.id, c.req.param("id"))))
  .patch("/contacts/:id", async (c) => c.json(await patchContact(c.env, c.var.project.id, c.req.param("id"), await readJson(c))))
  .delete("/contacts/:id", async (c) => c.json(await removeContact(c.env, c.var.project.id, c.req.param("id"))))

  .get("/audiences", async (c) => c.json({ data: await listAudiences(c.env, c.var.project.id) }))
  .post("/audiences", async (c) => c.json(await createAudience(c.env, c.var.project.id, await readJson(c)), 201))
  .get("/audiences/:id", async (c) => c.json(await getAudience(c.env, c.var.project.id, c.req.param("id"))))
  .patch("/audiences/:id", async (c) => c.json(await renameAudience(c.env, c.var.project.id, c.req.param("id"), await readJson(c))))
  .delete("/audiences/:id", async (c) => c.json(await removeAudience(c.env, c.var.project.id, c.req.param("id"))))
  .get("/audiences/:id/contacts", async (c) => c.json(await listAudienceContacts(c.env, c.var.project.id, c.req.param("id"), c.req.query())))
  .post("/audiences/:id/contacts", async (c) => c.json(await addAudienceContacts(c.env, c.var.project.id, c.req.param("id"), await readJson(c))))
  .delete("/audiences/:id/contacts", async (c) =>
    c.json(await removeAudienceContacts(c.env, c.var.project.id, c.req.param("id"), await readJson(c))),
  );

// /v1/admin/*. Project-scoped resources are also reachable at /v1/admin/projects/:slug/<resource>
// (mounted in app.ts), which is how the admin mirrors webhooks, templates, contacts, etc.
import { Hono } from "hono";
import { isProduction } from "../../env";
import { getMailerInfo } from "../../core/mailer-info";
import {
  addSuppression, createApiKey, createProject, disableProject, getProjectRecord, getStats, listApiKeyRecords,
  listProjectRecords, listSuppressionRecords, patchProject, removeSuppression, renameKey, requireProjectBySlug, resendEmail, revokeKey,
} from "../../core/admin";
import { getAnalytics } from "../../core/analytics";
import { listAllDomainRecords } from "../../core/domains";
import { getEmailContent, getEmailRecord, listEmailRecords, listEventRecords, parseListEmailsQuery } from "../../core/emails";
import { applyCfEvent } from "../../queue/events-consumer";
import { ApiError } from "../errors";
import { readJson, waitUntilOf, type AppEnv } from "../context";

async function projectIdFromQuery(env: Env, slug: string | undefined): Promise<string | null> {
  return slug ? (await requireProjectBySlug(env, slug)).id : null;
}

export const adminRoutes = new Hono<AppEnv>()
  // projects
  .post("/projects", async (c) => c.json(await createProject(c.env, await readJson(c)), 201))
  .get("/projects", async (c) => c.json({ data: await listProjectRecords(c.env) }))
  .get("/projects/:slug", async (c) => c.json(await getProjectRecord(c.env, c.req.param("slug"))))
  .patch("/projects/:slug", async (c) => c.json(await patchProject(c.env, c.req.param("slug"), await readJson(c))))
  .delete("/projects/:slug", async (c) => c.json(await disableProject(c.env, c.req.param("slug"))))
  .post("/projects/:slug/api-keys", async (c) => c.json(await createApiKey(c.env, c.req.param("slug"), await readJson(c)), 201))

  // domains of every project (cross-project)
  .get("/domains", async (c) => {
    const refresh = ["1", "true"].includes(c.req.query("refresh") ?? "");
    return c.json({ data: await listAllDomainRecords(c.env, { refresh }) });
  })

  // keys
  .get("/api-keys", async (c) => c.json({ data: await listApiKeyRecords(c.env, c.req.query("project")) }))
  .patch("/api-keys/:id", async (c) => c.json(await renameKey(c.env, c.req.param("id"), await readJson(c))))
  .delete("/api-keys/:id", async (c) => c.json(await revokeKey(c.env, c.req.param("id"))))

  // emails (cross-project)
  .get("/emails", async (c) => {
    const q = c.req.query();
    const projectId = await projectIdFromQuery(c.env, q.project);
    const { project: _p, ...rest } = q;
    return c.json(await listEmailRecords(c.env, parseListEmailsQuery(rest), projectId));
  })
  .get("/emails/:id", async (c) => c.json(await getEmailRecord(c.env, c.req.param("id"), null)))
  .get("/emails/:id/content", async (c) => c.json(await getEmailContent(c.env, c.req.param("id"), null)))
  .post("/emails/:id/resend", async (c) => c.json(await resendEmail(c.env, c.req.param("id"), null, waitUntilOf(c)), 202))

  // events + analytics (cross-project, optional ?project=)
  .get("/events", async (c) => {
    const q = c.req.query();
    const projectId = await projectIdFromQuery(c.env, q.project);
    const { project: _p, ...rest } = q;
    return c.json(await listEventRecords(c.env, rest, projectId));
  })
  .get("/analytics", async (c) => {
    const q = c.req.query();
    const projectId = await projectIdFromQuery(c.env, q.project);
    const { project: _p, ...rest } = q;
    return c.json(await getAnalytics(c.env, rest, projectId));
  })

  // suppressions
  .get("/suppressions", async (c) => c.json(await listSuppressionRecords(c.env, c.req.query())))
  .post("/suppressions", async (c) => c.json(await addSuppression(c.env, await readJson(c)), 201))
  .delete("/suppressions/:address", async (c) => c.json(await removeSuppression(c.env, decodeURIComponent(c.req.param("address")))))

  // stats
  .get("/stats", async (c) => c.json({ data: await getStats(c.env) }))

  // the mailer itself
  .get("/info", async (c) => c.json(await getMailerInfo(c.env)))

  // dev: run the events consumer logic on a hand-made Cloudflare event (event subscriptions do not reach wrangler dev)
  .post("/dev/events", async (c) => {
    if (isProduction(c.env)) throw ApiError.notFound("not_found", "not found");
    const body = await readJson(c);
    const events = Array.isArray(body) ? body : [body];
    const results = [];
    for (const ev of events) results.push(await applyCfEvent(c.env, ev));
    return c.json({ ok: true, result: Array.isArray(body) ? results : results[0] });
  });

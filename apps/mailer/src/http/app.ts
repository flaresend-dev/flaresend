import { Hono } from "hono";
import { adminProject, requireAdmin, requireProject } from "./auth";
import type { AppEnv } from "./context";
import { errorBody, toApiError } from "./errors";
import { adminRoutes } from "./routes/admin";
import { analyticsRoutes } from "./routes/analytics";
import { apiKeyRoutes } from "./routes/api-keys";
import { broadcastRoutes } from "./routes/broadcasts";
import { contactRoutes } from "./routes/contacts";
import { domainRoutes } from "./routes/domains";
import { emailRoutes } from "./routes/emails";
import { eventRoutes } from "./routes/events";
import { templateRoutes } from "./routes/templates";
import { trackingRoutes } from "./routes/tracking";
import { webhookRoutes } from "./routes/webhooks";

/** Routes that act on one project. Served at /v1/* (API key) and /v1/admin/projects/:slug/* (admin key). */
function projectRouter() {
  return new Hono<AppEnv>()
    .route("/", emailRoutes)
    .route("/", eventRoutes)
    .route("/", domainRoutes)
    .route("/", webhookRoutes)
    .route("/", templateRoutes)
    .route("/", analyticsRoutes)
    .route("/", contactRoutes)
    .route("/", broadcastRoutes);
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("X-Request-Id") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    await next();
    c.header("X-Request-Id", requestId);
  });

  app.onError((err, c) => {
    const api = toApiError(err);
    if (api.type === "internal_error") {
      console.error("unhandled error", { requestId: c.var.requestId, path: c.req.path, err: err instanceof Error ? err.stack : String(err) });
    }
    if (api.type === "rate_limit_error" && api.code === "rate_limited") c.header("Retry-After", "60");
    c.header("X-Request-Id", c.var.requestId);
    return c.json(errorBody(api), api.status as 400);
  });

  app.notFound((c) => c.json({ error: { type: "not_found", code: "route_not_found", message: `no route for ${c.req.method} ${c.req.path}` } }, 404));

  app.get("/health", async (c) => {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true });
  });

  app.route("/", trackingRoutes);

  // Admin
  app.use("/v1/admin/*", requireAdmin);
  app.use("/v1/admin/projects/:slug/*", adminProject);
  app.route("/v1/admin/projects/:slug", projectRouter());
  app.route("/v1/admin", adminRoutes);

  // Project API
  app.use("/v1/*", async (c, next) => (c.req.path.startsWith("/v1/admin/") ? next() : requireProject(c, next)));
  app.route("/v1", apiKeyRoutes);
  app.route("/v1", projectRouter());

  return app;
}

export const app = createApp();

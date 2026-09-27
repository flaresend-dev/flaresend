// Public, unauthenticated routes: open pixel, click redirect, unsubscribe.
import { Hono } from "hono";
import { one } from "../../db/client";
import { getEmailById, getEmailByOpenToken, type EmailRow } from "../../db/emails";
import { insertEventStmt, type EventRow } from "../../db/events";
import { unsubscribeContact, verifyUnsubscribeToken } from "../../core/contacts";
import { escapeHtml } from "../../core/mustache";
import { newId, nowIso } from "../../core/ids";
import { enqueueWebhooksSafe } from "../../webhooks/deliver";
import { waitUntilOf, type AppEnv } from "../context";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (ch) => ch.charCodeAt(0));

function pixel(): Response {
  return new Response(PIXEL, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", Pragma: "no-cache" },
  });
}

function event(e: EmailRow, type: string, data: unknown, at: string): EventRow {
  return {
    id: newId("evt"), email_id: e.id, project_id: e.project_id, recipient: null, type,
    cloudflare_event_id: null, data: JSON.stringify(data), created_at: at,
  };
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f4f5;color:#18181b;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
main{background:#fff;border-radius:12px;padding:32px;max-width:420px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;color:#3f3f46}
button{background:#18181b;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer}</style></head>
<body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export const trackingRoutes = new Hono<AppEnv>()
  .get("/t/o/:token", async (c) => {
    const email = await getEmailByOpenToken(c.env.DB, c.req.param("token"));
    if (!email) return c.text("not found", 404);
    if (!email.opened_at) {
      const at = nowIso();
      const ev = event(email, "email.opened", { userAgent: c.req.header("User-Agent") ?? null }, at);
      const r = await c.env.DB.batch([
        c.env.DB.prepare("UPDATE emails SET opened_at = ? WHERE id = ? AND opened_at IS NULL").bind(at, email.id),
        c.env.DB.prepare(
          `INSERT INTO email_events (id, email_id, project_id, recipient, type, cloudflare_event_id, data, created_at)
           SELECT ?1, ?2, ?3, NULL, 'email.opened', NULL, ?4, ?5
           WHERE EXISTS (SELECT 1 FROM emails WHERE id = ?2 AND opened_at = ?5)
             AND NOT EXISTS (SELECT 1 FROM email_events WHERE email_id = ?2 AND type = 'email.opened')`,
        ).bind(ev.id, email.id, email.project_id, ev.data, at),
      ]);
      if (r[0]!.meta.changes === 1) waitUntilOf(c)(enqueueWebhooksSafe(c.env, email.project_id, [ev], email));
    }
    return pixel();
  })
  .get("/t/c/:token", async (c) => {
    const link = await one<{ id: string; email_id: string; url: string }>(
      c.env.DB.prepare("SELECT id, email_id, url FROM email_links WHERE id = ?").bind(c.req.param("token")),
    );
    if (!link) return c.text("not found", 404);
    const email = await getEmailById(c.env.DB, link.email_id);
    if (email) {
      const at = nowIso();
      const ev = event(email, "email.clicked", { url: link.url, userAgent: c.req.header("User-Agent") ?? null }, at);
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE email_links SET clicks = clicks + 1 WHERE id = ?").bind(link.id),
        c.env.DB.prepare("UPDATE emails SET first_clicked_at = COALESCE(first_clicked_at, ?) WHERE id = ?").bind(at, email.id),
        insertEventStmt(c.env.DB, ev),
      ]);
      waitUntilOf(c)(enqueueWebhooksSafe(c.env, email.project_id, [ev], email));
    }
    return c.redirect(link.url, 302);
  })
  .get("/u/:token", async (c) => {
    const token = c.req.param("token");
    const contactId = c.env.TRACKING_SECRET ? await verifyUnsubscribeToken(c.env.TRACKING_SECRET, token) : null;
    if (!contactId) return page("Link not valid", "<p>This unsubscribe link is not valid.</p>", 404);
    return page(
      "Unsubscribe",
      `<p>Stop receiving these emails?</p><form method="post" action="/u/${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`,
    );
  })
  .post("/u/:token", async (c) => {
    const contactId = c.env.TRACKING_SECRET ? await verifyUnsubscribeToken(c.env.TRACKING_SECRET, c.req.param("token")) : null;
    if (!contactId) return page("Link not valid", "<p>This unsubscribe link is not valid.</p>", 404);
    const contact = await unsubscribeContact(c.env, contactId);
    if (!contact) return page("Link not valid", "<p>This unsubscribe link is not valid.</p>", 404);
    return page("You are unsubscribed", `<p>${escapeHtml(contact.email)} will not receive these emails any more.</p>`);
  });

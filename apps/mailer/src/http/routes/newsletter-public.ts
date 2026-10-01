import { Hono } from "hono";
import { NewsletterTheme } from "@flaresend/types";
import type { AppContext, AppEnv } from "../context";
import { ApiError } from "../errors";
import {
  getProjectBySlug,
  getProjectById,
  type ProjectRow,
} from "../../db/projects";
import {
  one,
  all,
  revision,
  parse,
  publicationUrl,
  type PublicationRow,
  type PostRow,
} from "../../core/newsletters/shared";
import { confirmationReady } from "../../core/newsletters/policy";
import { renderNewsletter } from "../../core/newsletters/render";
import {
  requestSubscription,
  confirmSubscription,
  verifySignedToken,
  unsubscribe,
} from "../../core/newsletters/subscriptions";
import { escapeHtml as esc } from "../../core/mustache";
import { sha256Hex } from "../../core/keys";
import { nowIso } from "../../core/ids";
import { decodeCursor, encodeCursor } from "../../db/client";

async function formBody(c: AppContext) {
  const reader = c.req.raw.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const p = await reader.read();
    if (p.done) break;
    total += p.value.length;
    if (total > 4096) {
      await reader.cancel();
      throw ApiError.validation(
        "body_too_large",
        "The form exceeds 4096 bytes.",
      );
    }
    chunks.push(p.value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const part of chunks) {
    bytes.set(part, at);
    at += part.length;
  }
  return new TextDecoder().decode(bytes);
}

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https:; form-action 'self'; base-uri 'none'; frame-ancestors 'self'";
function html(
  body: string,
  title: string,
  status = 200,
  options: {
    embed?: boolean;
    description?: string;
    canonical?: string;
    feed?: string;
  } = {},
) {
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${options.description ? `<meta name="description" content="${esc(options.description)}">` : ""}${options.canonical ? `<link rel="canonical" href="${esc(options.canonical)}">` : ""}${options.feed ? `<link rel="alternate" type="application/rss+xml" title="RSS" href="${esc(options.feed)}">` : ""}<style>body{font-family:Arial,Helvetica,sans-serif;background:#fafafa;color:#171717;margin:0;line-height:1.6}main{max-width:680px;margin:${options.embed ? "0" : "48px auto"};padding:24px;background:#fff}h1{line-height:1.2;letter-spacing:-.02em}a{color:#9a3412}input{box-sizing:border-box;display:block;width:100%;font:inherit;padding:12px;border:1px solid #737373;border-radius:6px;margin:8px 0 16px}button{font:inherit;color:white;background:#171717;border:0;padding:12px 20px;border-radius:6px;cursor:pointer}label{display:block}input[type=checkbox]{display:inline;width:auto}small{display:block;color:#525252}article{padding:24px 0;border-top:1px solid #ddd}article h2{margin:0 0 8px}nav{margin-bottom:24px}footer{margin-top:32px}*:focus-visible{outline:3px solid #c2410c;outline-offset:3px}.trap{position:absolute;left:-10000px}@media(max-width:600px){main{margin:0}}</style></head><body><main>${body}</main></body></html>`;
  return new Response(page, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": options.embed
        ? CSP.replace("frame-ancestors 'self'", "frame-ancestors *")
        : CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
async function resolve(
  c: AppContext,
): Promise<{ project: ProjectRow; pub: PublicationRow }> {
  const project = await getProjectBySlug(c.env.DB, c.req.param("projectSlug")!);
  if (!project)
    throw ApiError.notFound(
      "publication_not_found",
      "The newsletter was not found.",
    );
  const pub = await one<PublicationRow>(
    c.env.DB.prepare(
      "SELECT * FROM publications WHERE project_id=? AND slug=? AND site_enabled=1",
    ).bind(project.id, c.req.param("publicationSlug")!),
  );
  if (!pub)
    throw ApiError.notFound(
      "publication_not_found",
      "The newsletter was not found.",
    );
  return { project, pub };
}
function subscriptionForm(
  project: ProjectRow,
  pub: PublicationRow,
  base: string,
) {
  return `<form method="post" action="${esc(base)}/subscribe"><label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>First name <small>Optional</small><input name="firstName" autocomplete="given-name" maxlength="200"></label><label class="trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><input type="hidden" name="consentVersion" value="v1"><label><input type="checkbox" name="consent" value="yes" required> I agree to receive this newsletter by email.</label><p><small>We send a confirmation link first. You can unsubscribe at any time.</small></p><button type="submit">Subscribe</button></form>`;
}
function sameOrigin(c: AppContext) {
  const origin = c.req.header("Origin");
  if (!origin || origin !== new URL(c.req.url).origin)
    throw ApiError.permission(
      "invalid_origin",
      "Submit this form from the newsletter website.",
    );
}
async function publicForm(c: AppContext, embed = false) {
  const { project, pub } = await resolve(c);
  const base = publicationUrl(c.env, project, pub);
  const ready =
    pub.form_enabled && (await confirmationReady(c.env, project, pub));
  return html(
    `<nav><a href="${esc(base)}">${esc(pub.name)}</a></nav><h1>${esc(pub.name)}</h1><p>${esc(pub.description)}</p>${ready ? subscriptionForm(project, pub, base) : "<p>Subscriptions are not available yet.</p>"}`,
    pub.name,
    200,
    { embed, description: pub.description },
  );
}

export const newsletterPublicRoutes = new Hono<AppEnv>()
  .get("/n/assets/:assetId", async (c) => {
    const asset = await one<{ r2_key: string; mime_type: string }>(
      c.env.DB.prepare(
        `SELECT a.r2_key,a.mime_type FROM newsletter_assets a WHERE a.id=? AND a.status!='deleted' AND (EXISTS(SELECT 1 FROM newsletter_revision_assets ra JOIN newsletter_posts p ON p.public_revision_id=ra.revision_id JOIN publications pub ON pub.id=p.publication_id WHERE ra.asset_id=a.id AND pub.site_enabled=1) OR EXISTS(SELECT 1 FROM publications pub WHERE pub.logo_asset_id=a.id AND pub.site_enabled=1) OR EXISTS(SELECT 1 FROM newsletter_revision_assets ra JOIN newsletter_email_runs r ON r.revision_id=ra.revision_id WHERE ra.asset_id=a.id))`,
      ).bind(c.req.param("assetId")),
    );
    if (!asset) return c.text("Not found", 404);
    const object = await c.env.PAYLOADS.get(asset.r2_key);
    if (!object) return c.text("Not found", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": asset.mime_type,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })
  .get("/n/confirm/:token", async (c) => {
    const token = c.req.param("token");
    const row =
      token.length <= 100
        ? await one(
            c.env.DB.prepare(
              "SELECT token_hash FROM newsletter_tokens WHERE token_hash=? AND expires_at>? AND consumed_at IS NULL",
            ).bind(await sha256Hex(token), nowIso()),
          )
        : null;
    return html(
      row
        ? `<h1>Confirm your subscription</h1><p>Select the button to confirm your request.</p><form method="post"><button type="submit">Confirm subscription</button></form>`
        : "<h1>This link expired</h1><p>Open the newsletter website to request another confirmation link.</p>",
      "Confirm subscription",
      row ? 200 : 410,
    );
  })
  .post("/n/confirm/:token", async (c) => {
    sameOrigin(c);
    const ok = await confirmSubscription(c.env, c.req.param("token"));
    return html(
      ok
        ? "<h1>You are subscribed</h1><p>New posts will arrive in your inbox.</p>"
        : "<h1>This link is no longer valid</h1><p>Request a new confirmation link from the newsletter website.</p>",
      "Subscription confirmation",
      ok ? 200 : 410,
    );
  })
  .get("/n/u/:token", async (c) => {
    const payload = await verifySignedToken(
      c.env,
      "unsubscribe",
      c.req.param("token"),
    );
    return html(
      payload
        ? '<h1>Unsubscribe</h1><p>Stop email from this newsletter?</p><form method="post"><button type="submit">Unsubscribe</button></form>'
        : "<h1>Link not valid</h1>",
      "Unsubscribe",
      payload ? 200 : 404,
    );
  })
  .post("/n/u/:token", async (c) => {
    const payload = await verifySignedToken(
      c.env,
      "unsubscribe",
      c.req.param("token"),
    );
    if (!payload) return html("<h1>Link not valid</h1>", "Unsubscribe", 404);
    const [pubId, subId, runId] = payload.split("~");
    const p = await one<PublicationRow>(
      c.env.DB.prepare("SELECT * FROM publications WHERE id=?").bind(pubId),
    );
    if (!p || !subId)
      return html("<h1>Link not valid</h1>", "Unsubscribe", 404);
    const project = await getProjectById(c.env.DB, p.project_id);
    if (!project) return html("<h1>Link not valid</h1>", "Unsubscribe", 404);
    try {
      await unsubscribe(c.env, project, p.id, subId, undefined, "subscriber", runId ? { runId } : {});
    } catch (e) {
      if (!(
        e instanceof ApiError &&
        ["subscription_not_found", "revision_conflict"].includes(e.code)
      ))
        throw e;
    }
    return html(
      "<h1>You are unsubscribed</h1><p>You will not receive email from this newsletter.</p>",
      "Unsubscribed",
    );
  })
  .get("/n/:projectSlug/:publicationSlug/subscribe", (c) => publicForm(c))
  .get("/n/:projectSlug/:publicationSlug/embed", (c) => publicForm(c, true))
  .post("/n/:projectSlug/:publicationSlug/subscribe", async (c) => {
    sameOrigin(c);
    const { project, pub } = await resolve(c);
    if (Number(c.req.header("Content-Length")) > 4096)
      return c.text("Request too large", 413);
    const ip = c.req.header("CF-Connecting-IP") || "unknown";
    const allowed = await c.env.NEWSLETTER_PUBLIC_RATE_LIMITER.limit({
      key: ip,
    });
    if (!allowed.success)
      throw ApiError.rateLimited(
        "rate_limited",
        "Too many requests. Try again later.",
      );
    const text = await formBody(c);
    if (new TextEncoder().encode(text).length > 4096)
      return c.text("Request too large", 413);
    const form = new URLSearchParams(text);
    await requestSubscription(
      c.env,
      project,
      pub,
      {
        email: form.get("email"),
        firstName: form.get("firstName") || undefined,
        consent: form.get("consent"),
        consentVersion: form.get("consentVersion") || "v1",
        source: "public_form",
        website: form.get("website") || "",
      },
      c.req.header("CF-Connecting-IP") || "unknown",
    );
    return html(
      `<h1>Check your inbox</h1><p>Check your inbox for a confirmation link.</p><p><a href="${esc(publicationUrl(c.env, project, pub))}">Back to the newsletter</a></p>`,
      "Check your inbox",
    );
  })
  .get("/n/:projectSlug/:publicationSlug/feed.xml", async (c) => {
    const { project, pub } = await resolve(c);
    const base = publicationUrl(c.env, project, pub);
    const rows = await all<PostRow>(
      c.env.DB.prepare(
        "SELECT * FROM newsletter_posts WHERE publication_id=? AND public_revision_id IS NOT NULL ORDER BY published_at DESC LIMIT 100",
      ).bind(pub.id),
    );
    const items = await Promise.all(
      rows.map(async (p) => {
        const r = await revision(c.env, p, p.public_revision_id!);
        const meta = JSON.parse(r.row.metadata_json) as {
          title: string;
          subtitle: string;
          slug: string;
        };
        return `<item><title>${esc(meta.title)}</title><link>${esc(`${base}/p/${p.slug}`)}</link><guid>${esc(p.id)}</guid><pubDate>${new Date(p.published_at!).toUTCString()}</pubDate><description>${esc(meta.subtitle)}</description></item>`;
      }),
    );
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(pub.name)}</title><link>${esc(base)}</link><description>${esc(pub.description)}</description>${items.join("")}</channel></rss>`,
      {
        headers: {
          "Content-Type": "application/rss+xml; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  })
  .get("/n/:projectSlug/:publicationSlug/p/:postSlug", async (c) => {
    const { project, pub } = await resolve(c);
    const post = await one<PostRow>(
      c.env.DB.prepare(
        "SELECT * FROM newsletter_posts WHERE publication_id=? AND slug=? AND public_revision_id IS NOT NULL",
      ).bind(pub.id, c.req.param("postSlug")),
    );
    if (!post) return html("<h1>Article not found</h1>", "Not found", 404);
    const r = await revision(c.env, post, post.public_revision_id!);
    const meta = JSON.parse(r.row.metadata_json) as {
      title: string;
      subtitle: string;
      previewText: string;
      theme: unknown;
      publicationName: string;
      postalAddress: string;
      logoAssetId?: string | null;
      authorLabel: string;
    };
    const base = publicationUrl(c.env, project, pub);
    const result = renderNewsletter(r.document, {
      title: meta.title,
      subtitle: meta.subtitle,
      previewText: meta.previewText,
      publicationName: meta.publicationName,
      postalAddress: meta.postalAddress,
      logoAssetId: meta.logoAssetId,
      theme: parse(NewsletterTheme, meta.theme),
      target: "web",
      assetUrl: (id) =>
        `${c.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/n/assets/${id}`,
      siteUrl: base,
    });
    const marker = "</head>";
    const metadata = `<meta name="description" content="${esc(meta.subtitle || pub.description)}"><link rel="canonical" href="${esc(`${base}/p/${post.slug}`)}"><link rel="alternate" type="application/rss+xml" href="${esc(base)}/feed.xml">`;
    const body = result.html
      .replace(marker, metadata + marker)
      .replace(
        "<header style=",
        `<nav style="margin-bottom:24px"><a href="${esc(base)}">${esc(pub.name)}</a></nav><p style="font-size:13px;color:#525252">${esc(meta.authorLabel || pub.name)} · ${esc(new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: pub.timezone }).format(new Date(post.published_at!)))}</p><header style=`,
      );
    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": CSP,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  })
  .get("/n/:projectSlug/:publicationSlug", async (c) => {
    const { project, pub } = await resolve(c);
    const base = publicationUrl(c.env, project, pub);
    const before = decodeCursor(c.req.query("before") || "");
    const rows = await all<PostRow>(
      c.env.DB.prepare(
        `SELECT * FROM newsletter_posts WHERE publication_id=? AND public_revision_id IS NOT NULL${before ? " AND (published_at<? OR (published_at=? AND id<?))" : ""} ORDER BY published_at DESC,id DESC LIMIT 26`,
      ).bind(
        pub.id,
        ...(before ? [before.createdAt, before.createdAt, before.id] : []),
      ),
    );
    const articles = await Promise.all(
      rows.slice(0, 25).map(async (p) => {
        const r = await revision(c.env, p, p.public_revision_id!);
        const meta = JSON.parse(r.row.metadata_json) as {
          title: string;
          subtitle: string;
        };
        return `<article><h2><a href="${esc(base)}/p/${esc(p.slug)}">${esc(meta.title)}</a></h2><p>${esc(meta.subtitle)}</p><small>${esc(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: pub.timezone }).format(new Date(p.published_at!)))}</small></article>`;
      }),
    );
    const ready =
      pub.form_enabled && (await confirmationReady(c.env, project, pub));
    return html(
      `${pub.logo_asset_id ? `<img src="/n/assets/${esc(pub.logo_asset_id)}" alt="" width="64" height="64">` : ""}<h1>${esc(pub.name)}</h1><p>${esc(pub.description)}</p>${ready ? subscriptionForm(project, pub, base) : "<p>Subscriptions are not available yet.</p>"}<h2 style="margin-top:40px">Latest posts</h2>${articles.length ? articles.join("") : "<p>The first article will appear here after publication.</p>"}${rows.length > 25 ? `<a href="${esc(base)}?before=${esc(encodeCursor(rows[24]!.published_at!, rows[24]!.id))}">Older posts</a>` : ""}<footer><a href="${esc(base)}/feed.xml">RSS feed</a></footer>`,
      pub.name,
      200,
      {
        description: pub.description,
        canonical: base,
        feed: `${base}/feed.xml`,
      },
    );
  });

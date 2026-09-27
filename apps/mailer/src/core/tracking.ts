// Open pixel + click link rewriting. The original HTML in R2 is never modified;
// the tracked copy is stored at payloads/{id}.tracked.html.
import { publicBaseUrl } from "../env";
import type { EmailRow } from "../db/emails";
import { getTrackedHtml, putTrackedHtml } from "../storage/payloads";
import { hmacSha256, toBase64Url } from "./keys";
import { randomBase62 } from "./ids";

// href inside an <a ...> tag only. Group 2 is the quote, group 3 the URL.
const ANCHOR_HREF_RE = /(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi;

export interface TrackedLink {
  id: string;
  url: string;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function shouldTrackUrl(url: string, baseUrl: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false; // skips mailto:, tel:, #anchors, relative links
  if (url.includes("{{")) return false;
  if (url.startsWith(baseUrl + "/")) return false; // our own unsubscribe / tracking links
  return true;
}

export function rewriteLinks(html: string, baseUrl: string, newToken = () => randomBase62(16)): { html: string; links: TrackedLink[] } {
  const links: TrackedLink[] = [];
  const out = html.replace(ANCHOR_HREF_RE, (full, prefix: string, quote: string, rawUrl: string) => {
    const url = decodeEntities(rawUrl.trim());
    if (!shouldTrackUrl(url, baseUrl)) return full;
    const id = newToken();
    links.push({ id, url });
    return `${prefix}${quote}${baseUrl}/t/c/${id}${quote}`;
  });
  return { html: out, links };
}

export function injectPixel(html: string, pixelUrl: string): string {
  const img = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none">`;
  const i = html.search(/<\/body\s*>/i);
  return i === -1 ? html + img : html.slice(0, i) + img + html.slice(i);
}

export async function openToken(secret: string, emailId: string): Promise<string> {
  return toBase64Url(await hmacSha256(secret, emailId)).slice(0, 22);
}

/**
 * Returns the HTML to send. Idempotent across retries: if a tracked copy already exists in R2 it is reused,
 * so links are only inserted once.
 */
export async function applyTracking(env: Env, email: EmailRow, html: string | null): Promise<string | null> {
  if (!html || (email.track_opens !== 1 && email.track_clicks !== 1)) return html;
  const existing = await getTrackedHtml(env, email.id);
  if (existing) return existing;

  const base = publicBaseUrl(env);
  let tracked = html;
  const stmts: D1PreparedStatement[] = [];

  if (email.track_clicks === 1) {
    const r = rewriteLinks(tracked, base);
    tracked = r.html;
    for (const l of r.links) {
      stmts.push(env.DB.prepare("INSERT INTO email_links (id, email_id, url, clicks) VALUES (?, ?, ?, 0)").bind(l.id, email.id, l.url));
    }
  }
  if (email.track_opens === 1) {
    if (env.TRACKING_SECRET) {
      const token = await openToken(env.TRACKING_SECRET, email.id);
      tracked = injectPixel(tracked, `${base}/t/o/${token}`);
      stmts.push(env.DB.prepare("UPDATE emails SET open_token = ? WHERE id = ?").bind(token, email.id));
    } else {
      console.warn("TRACKING_SECRET is not set; open tracking skipped", { emailId: email.id });
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await putTrackedHtml(env, email.id, tracked);
  return tracked;
}

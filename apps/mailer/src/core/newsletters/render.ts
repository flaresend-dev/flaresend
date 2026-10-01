import type {
  NewsletterDocument,
  NewsletterInline,
  NewsletterTheme,
} from "@flaresend/types";
import { escapeHtml } from "../mustache";

export interface RenderOptions {
  title: string;
  subtitle: string;
  previewText: string;
  publicationName: string;
  postalAddress: string;
  logoAssetId?: string | null;
  theme: NewsletterTheme;
  target: "email" | "web" | "text";
  assetUrl: (id: string) => string;
  unsubscribeUrl?: string;
  siteUrl?: string;
  values?: { firstName?: string | null; lastName?: string | null };
}
const esc = escapeHtml;
function inline(
  items: NewsletterInline[],
  values: RenderOptions["values"],
  text = false,
): string {
  return items
    .map((i) => {
      if (i.type === "personalization")
        return text
          ? values?.[i.field] || i.fallback
          : esc(values?.[i.field] || i.fallback);
      if (text) return i.text + (i.href ? ` (${i.href})` : "");
      let value = esc(i.text).replace(/\n/g, "<br>");
      if (i.bold) value = `<strong>${value}</strong>`;
      if (i.italic) value = `<em>${value}</em>`;
      return i.href ? `<a href="${esc(i.href)}">${value}</a>` : value;
    })
    .join("");
}
export function renderNewsletter(doc: NewsletterDocument, o: RenderOptions) {
  const font =
    o.theme.font === "serif" ? "Georgia,serif" : "Arial,Helvetica,sans-serif";
  const textAccent =
    luminance(o.theme.accent) <= 0.183 ? o.theme.accent : "#171717";
  const digest = o.theme.layout === "digest";
  const announcement = o.theme.layout === "announcement";
  const logo = o.logoAssetId
    ? `<img src="${esc(o.assetUrl(o.logoAssetId))}" alt="${esc(o.publicationName)}" style="max-width:160px;max-height:64px;width:auto;height:auto;margin:${announcement ? "0 auto 20px" : "0 0 20px"}">`
    : "";
  const html: string[] = [];
  const text: string[] = [o.title, o.subtitle].filter(Boolean);
  for (const b of doc.blocks) {
    switch (b.type) {
      case "paragraph":
      case "heading2":
      case "heading3":
      case "quote": {
        const tag = {
          paragraph: "p",
          heading2: "h2",
          heading3: "h3",
          quote: "blockquote",
        }[b.type];
        html.push(
          `<${tag} style="margin:0 0 20px;line-height:1.65${digest && b.type === "heading2" ? ";padding-top:20px;border-top:1px solid #d4d4d4" : ""}">${inline(b.content, o.values)}</${tag}>`,
        );
        text.push(inline(b.content, o.values, true));
        break;
      }
      case "bulletList":
      case "orderedList": {
        const tag = b.type === "orderedList" ? "ol" : "ul";
        html.push(
          `<${tag} style="margin:0 0 20px;padding-left:24px">${b.items.map((i) => `<li style="margin-bottom:8px">${inline(i, o.values)}</li>`).join("")}</${tag}>`,
        );
        text.push(
          b.items
            .map(
              (i, n) =>
                `${b.type === "orderedList" ? `${n + 1}.` : "•"} ${inline(i, o.values, true)}`,
            )
            .join("\n"),
        );
        break;
      }
      case "divider":
        html.push(
          '<hr style="border:0;border-top:1px solid #d4d4d4;margin:28px 0">',
        );
        text.push("---");
        break;
      case "image": {
        const size = b.width
          ? `width:100%;max-width:${b.width}px;margin:0 auto`
          : "width:100%";
        const image = `<img src="${esc(o.assetUrl(b.assetId))}" alt="${esc(b.decorative ? "" : b.alt)}"${b.width ? ` width="${b.width}"` : ""} style="display:block;${size};height:auto;border:0">`;
        html.push(
          `<figure style="margin:24px 0">${b.href ? `<a href="${esc(b.href)}">${image}</a>` : image}${b.caption ? `<figcaption style="font-size:14px;color:#525252;margin-top:8px">${esc(b.caption)}</figcaption>` : ""}</figure>`,
        );
        if (b.alt || b.caption)
          text.push([b.alt, b.caption].filter(Boolean).join(" — "));
        break;
      }
      case "button":
        // An unfinished button (no label or link) is left out of the output.
        if (!b.label.trim() || !b.href) break;
        html.push(
          `<p style="margin:24px 0"><a href="${esc(b.href)}" style="display:inline-block;background:${o.theme.accent};color:${buttonInk(o.theme.accent)};text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${esc(b.label)}</a></p>`,
        );
        text.push(`${b.label}: ${b.href}`);
        break;
    }
  }
  const footer =
    o.target === "email"
      ? `<p>${esc(o.publicationName)}${o.postalAddress ? `<br>${esc(o.postalAddress)}` : ""}</p><p><a href="${esc(o.unsubscribeUrl || "#unsubscribe-preview")}">Unsubscribe</a></p>`
      : `<p>${esc(o.publicationName)}${o.siteUrl ? ` · <a href="${esc(o.siteUrl)}/subscribe">Subscribe</a>` : ""}</p>`;
  const body = `<header style="margin-bottom:32px;${announcement ? "text-align:center;padding:24px 0" : digest ? "padding-bottom:24px;border-bottom:3px solid " + o.theme.accent : ""}">${logo}<p style="font-size:13px;font-weight:bold;color:${textAccent};margin:0 0 16px">${esc(o.publicationName)}</p><h1 style="font-size:${announcement ? 36 : 30}px;line-height:1.2;margin:0 0 12px">${esc(o.title)}</h1>${o.subtitle ? `<p style="color:#525252;font-size:18px;margin:0">${esc(o.subtitle)}</p>` : ""}</header>${html.join("")}<footer style="margin-top:40px;border-top:1px solid #d4d4d4;padding-top:16px;color:#525252;font-size:13px">${footer}</footer>`;
  const css = `body{margin:0;background:#fafafa;color:#171717;font-family:${font}}a{color:${textAccent}}h2{font-size:24px}h3{font-size:20px}p,li{overflow-wrap:anywhere}blockquote{margin-left:0;font-style:italic}img{max-width:100%}`;
  const output =
    o.target === "email"
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff"><tr><td style="padding:32px 24px;font-size:17px;line-height:1.65;font-family:${font}">${body}</td></tr></table></td></tr></table>`
      : `<main style="max-width:680px;margin:40px auto;padding:24px;font-size:18px;line-height:1.65;background:white">${body}</main>`;
  return {
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title><style>${css}</style></head><body>${o.target === "email" && o.previewText ? `<div style="display:none;max-height:0;overflow:hidden">${esc(o.previewText)}</div>` : ""}${output}</body></html>`,
    text: [
      ...text,
      o.publicationName,
      ...(o.target === "email"
        ? [o.postalAddress, `Unsubscribe: ${o.unsubscribeUrl || "[preview]"}`]
        : []),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
export function buttonInk(accent: string) {
  return luminance(accent) > 0.179 ? "#000000" : "#ffffff";
}

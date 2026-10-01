// Conversion between BlockNote's block JSON and the stored NewsletterDocument (schema version 1).
// Pure: no React, no BlockNote import, so it is unit tested and the server format never depends on the editor.
import type { NewsletterBlock, NewsletterDocument, NewsletterInline } from "@flaresend/types";

/** The parts of BlockNote's JSON this module reads and writes. */
export type BnStyles = { bold?: boolean; italic?: boolean } & Record<string, unknown>;
export type BnText = { type: "text"; text: string; styles: BnStyles };
export type BnLink = { type: "link"; href: string; content: BnText[] };
export type BnPersonalization = { type: "personalization"; props: { field: "firstName" | "lastName"; fallback: string } };
export type BnInline = BnText | BnLink | BnPersonalization;
export interface BnBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: BnInline[] | string | unknown;
  children?: BnBlock[];
}

/** Image description, "decorative" and link are not BlockNote image props; the editor keeps them beside the blocks. */
export type ImageMeta = Record<string, { alt: string; decorative: boolean; href: string }>;

const ASSET = "newsletter-asset:";
export const assetRef = (id: string) => `${ASSET}${id}`;
export const assetIdOf = (url: unknown) =>
  typeof url === "string" && url.startsWith(ASSET) ? url.slice(ASSET.length) : null;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

function toBnInline(items: NewsletterInline[]): BnInline[] {
  const out: BnInline[] = [];
  for (const i of items) {
    if (i.type === "personalization") {
      out.push({ type: "personalization", props: { field: i.field, fallback: i.fallback } });
      continue;
    }
    if (!i.text) continue;
    const styles: BnStyles = {};
    if (i.bold) styles.bold = true;
    if (i.italic) styles.italic = true;
    const text: BnText = { type: "text", text: i.text, styles };
    const last = out[out.length - 1];
    if (i.href) {
      // Adjacent pieces of one link stay one link.
      if (last?.type === "link" && last.href === i.href) last.content.push(text);
      else out.push({ type: "link", href: i.href, content: [text] });
    } else out.push(text);
  }
  return out;
}

function textOf(t: BnText, href?: string): NewsletterInline {
  const node: NewsletterInline = { type: "text", text: t.text };
  if (t.styles?.bold) node.bold = true;
  if (t.styles?.italic) node.italic = true;
  if (href) node.href = href;
  return node;
}

function fromBnInline(content: unknown): NewsletterInline[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const out: NewsletterInline[] = [];
  for (const c of content as BnInline[]) {
    if (c.type === "text") out.push(textOf(c));
    else if (c.type === "link") for (const t of c.content ?? []) out.push(textOf(t, c.href));
    else if (c.type === "personalization")
      out.push({ type: "personalization", field: c.props.field, fallback: c.props.fallback ?? "" });
  }
  return out;
}

export function toBlocks(doc: NewsletterDocument): { blocks: BnBlock[]; imageMeta: ImageMeta } {
  const blocks: BnBlock[] = [];
  const imageMeta: ImageMeta = {};
  for (const b of doc.blocks) {
    switch (b.type) {
      case "paragraph":
        blocks.push({ id: b.id, type: "paragraph", content: toBnInline(b.content) });
        break;
      case "heading2":
      case "heading3":
        blocks.push({ id: b.id, type: "heading", props: { level: b.type === "heading2" ? 2 : 3 }, content: toBnInline(b.content) });
        break;
      case "quote":
        blocks.push({ id: b.id, type: "quote", content: toBnInline(b.content) });
        break;
      case "bulletList":
      case "orderedList":
        b.items.forEach((item, n) =>
          blocks.push({
            // The first item keeps the list's id so a round trip is stable.
            id: n === 0 ? b.id : newId(),
            type: b.type === "bulletList" ? "bulletListItem" : "numberedListItem",
            content: toBnInline(item),
          }),
        );
        break;
      case "image":
        blocks.push({
          id: b.id,
          type: "image",
          props: { url: assetRef(b.assetId), caption: b.caption ?? "", ...(b.width ? { previewWidth: b.width } : {}) },
        });
        imageMeta[b.id] = { alt: b.alt, decorative: b.decorative, href: b.href ?? "" };
        break;
      case "divider":
        blocks.push({ id: b.id, type: "divider" });
        break;
      case "button":
        blocks.push({ id: b.id, type: "button", props: { label: b.label, href: b.href } });
        break;
    }
  }
  return { blocks, imageMeta };
}

/** Depth-first, so nested list items (Tab in the editor) are kept in reading order. */
function flatten(blocks: BnBlock[]): BnBlock[] {
  return blocks.flatMap((b) => [b, ...flatten(b.children ?? [])]);
}

const isEmptyParagraph = (b: NewsletterBlock) =>
  b.type === "paragraph" && !b.content.some((i) => i.type === "personalization" || i.text.trim());

export function fromBlocks(input: BnBlock[], imageMeta: ImageMeta = {}): NewsletterDocument {
  const out: NewsletterBlock[] = [];
  const seen = new Set<string>();
  const id = (b: BnBlock) => {
    let v = b.id && !seen.has(b.id) ? b.id : newId();
    while (seen.has(v)) v = newId();
    seen.add(v);
    return v;
  };
  for (const b of flatten(input)) {
    const props = b.props ?? {};
    switch (b.type) {
      case "paragraph":
        out.push({ id: id(b), type: "paragraph", content: fromBnInline(b.content) });
        break;
      case "heading":
        out.push({ id: id(b), type: Number(props.level) <= 2 ? "heading2" : "heading3", content: fromBnInline(b.content) });
        break;
      case "quote":
        out.push({ id: id(b), type: "quote", content: fromBnInline(b.content) });
        break;
      case "bulletListItem":
      case "numberedListItem": {
        const type = b.type === "bulletListItem" ? "bulletList" : "orderedList";
        const last = out[out.length - 1];
        const item = fromBnInline(b.content);
        if (last && last.type === type && last.items.length < 200) last.items.push(item);
        else out.push({ id: id(b), type, items: [item] });
        break;
      }
      case "image": {
        const assetId = assetIdOf(props.url);
        if (!assetId) break; // Not uploaded yet: nothing to save.
        const meta = (b.id && imageMeta[b.id]) || { alt: "", decorative: false, href: "" };
        const width = Number(props.previewWidth);
        out.push({
          id: id(b),
          type: "image",
          assetId,
          alt: meta.decorative ? "" : meta.alt.slice(0, 500),
          decorative: meta.decorative,
          ...(typeof props.caption === "string" && props.caption ? { caption: props.caption.slice(0, 500) } : {}),
          ...(meta.href ? { href: meta.href } : {}),
          ...(Number.isFinite(width) && width >= 80 ? { width: Math.min(1200, Math.round(width)) } : {}),
        });
        break;
      }
      case "divider":
        out.push({ id: id(b), type: "divider" });
        break;
      case "button":
        out.push({
          id: id(b),
          type: "button",
          label: String(props.label ?? "").slice(0, 100),
          href: String(props.href ?? ""),
        });
        break;
      default:
        // A block type outside the newsletter schema (pasted content): keep its text as a paragraph.
        if (Array.isArray(b.content)) out.push({ id: id(b), type: "paragraph", content: fromBnInline(b.content) });
    }
  }
  while (out.length > 1 && isEmptyParagraph(out[out.length - 1]!)) out.pop();
  return { schemaVersion: 1, blocks: out.slice(0, 200) };
}

const TOKEN = /\{\{\s*(firstName|lastName)\s*\|([^}]*)\}\}/g;

/** Turns literal {{firstName|x}} text (from AI Markdown) into personalization nodes. */
export function rehydrateTokens<T extends BnBlock>(blocks: T[]): T[] {
  return blocks.map((b) => {
    const next = { ...b } as T;
    if (Array.isArray(b.content)) {
      const content: BnInline[] = [];
      for (const c of b.content as BnInline[]) {
        if (c.type !== "text" || !TOKEN.test(c.text)) {
          content.push(c);
          continue;
        }
        TOKEN.lastIndex = 0;
        let at = 0;
        for (const m of c.text.matchAll(TOKEN)) {
          if (m.index! > at) content.push({ type: "text", text: c.text.slice(at, m.index), styles: c.styles });
          content.push({
            type: "personalization",
            props: { field: m[1] as "firstName" | "lastName", fallback: m[2]!.trim() },
          });
          at = m.index! + m[0].length;
        }
        if (at < c.text.length) content.push({ type: "text", text: c.text.slice(at), styles: c.styles });
      }
      next.content = content;
    }
    if (b.children?.length) next.children = rehydrateTokens(b.children);
    return next;
  });
}

/** Plain text of the body, for the word count. */
export function plainText(blocks: BnBlock[]): string {
  return flatten(blocks)
    .map((b) => {
      if (b.type === "button") return String(b.props?.label ?? "");
      return fromBnInline(b.content)
        .map((i) => (i.type === "text" ? i.text : i.fallback))
        .join("");
    })
    .filter(Boolean)
    .join("\n");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Splits an AI draft into title, subtitle and body (lines 1, 2, then the rest). */
export function splitDraft(text: string): { title: string; subtitle: string; body: string } {
  const lines = text.replace(/\r/g, "").split("\n");
  const clean = (s: string | undefined) => (s ?? "").replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").trim();
  const firstText = lines.findIndex((l) => l.trim());
  if (firstText < 0) return { title: "", subtitle: "", body: "" };
  const title = clean(lines[firstText]);
  let i = firstText + 1;
  let subtitle = "";
  if (lines[i]?.trim()) {
    subtitle = clean(lines[i]);
    i++;
  }
  return { title: title.slice(0, 100), subtitle: subtitle.slice(0, 200), body: lines.slice(i).join("\n").trim() };
}

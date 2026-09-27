// Tiny Mustache-style renderer for D1 templates. No eval, no external engine.
// Supports: {{path.to.var}} (HTML-escaped), {{{raw}}} (unescaped), {{#if var}}...{{else}}...{{/if}},
// {{#each list}}...{{/each}} with {{this}}, {{this.field}}, {{@index}}.

type Node =
  | { t: "text"; v: string }
  | { t: "var"; path: string; raw: boolean }
  | { t: "if"; path: string; then: Node[]; else: Node[] }
  | { t: "each"; path: string; body: Node[] };

export class TemplateSyntaxError extends Error {}

const TOKEN_RE = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g;

export function parse(src: string): Node[] {
  const root: Node[] = [];
  const stack: Array<{ node: Extract<Node, { t: "if" | "each" }>; target: Node[] }> = [];
  let cur = root;
  let last = 0;
  for (const m of src.matchAll(TOKEN_RE)) {
    if (m.index! > last) cur.push({ t: "text", v: src.slice(last, m.index) });
    last = m.index! + m[0].length;
    if (m[1] !== undefined) {
      cur.push({ t: "var", path: m[1], raw: true });
      continue;
    }
    const tag = m[2]!;
    if (tag.startsWith("#if ") || tag.startsWith("#each ")) {
      const isIf = tag.startsWith("#if ");
      const path = tag.slice(isIf ? 4 : 6).trim();
      const node: Extract<Node, { t: "if" | "each" }> = isIf ? { t: "if", path, then: [], else: [] } : { t: "each", path, body: [] };
      cur.push(node);
      stack.push({ node, target: cur });
      cur = node.t === "if" ? node.then : node.body;
    } else if (tag === "else") {
      const top = stack[stack.length - 1];
      if (!top || top.node.t !== "if") throw new TemplateSyntaxError("{{else}} outside {{#if}}");
      cur = top.node.else;
    } else if (tag === "/if" || tag === "/each") {
      const top = stack.pop();
      if (!top || `/${top.node.t}` !== tag) throw new TemplateSyntaxError(`unexpected {{${tag}}}`);
      cur = top.target;
    } else if (tag.startsWith("#") || tag.startsWith("/")) {
      throw new TemplateSyntaxError(`unsupported block {{${tag}}}`);
    } else {
      cur.push({ t: "var", path: tag, raw: false });
    }
  }
  if (last < src.length) cur.push({ t: "text", v: src.slice(last) });
  if (stack.length) throw new TemplateSyntaxError(`unclosed {{#${stack[stack.length - 1]!.node.t}}}`);
  return root;
}

interface Scope {
  value: unknown;
  index?: number;
}

function walk(value: unknown, parts: string[]): unknown {
  let v = value;
  for (const p of parts) {
    if (v == null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

export function lookup(scopes: Scope[], path: string): unknown {
  const top = scopes[scopes.length - 1]!;
  if (path === "this" || path === ".") return top.value;
  if (path === "@index") return top.index;
  const parts = path.split(".");
  if (parts[0] === "this") return walk(top.value, parts.slice(1));
  for (let i = scopes.length - 1; i >= 0; i--) {
    const s = scopes[i]!.value;
    if (s && typeof s === "object" && parts[0]! in (s as object)) return walk(s, parts);
  }
  return undefined;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== "" && v !== 0;
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderNodes(nodes: Node[], scopes: Scope[], escape: boolean): string {
  let out = "";
  for (const n of nodes) {
    switch (n.t) {
      case "text":
        out += n.v;
        break;
      case "var": {
        const s = stringify(lookup(scopes, n.path));
        out += n.raw || !escape ? s : escapeHtml(s);
        break;
      }
      case "if":
        out += renderNodes(truthy(lookup(scopes, n.path)) ? n.then : n.else, scopes, escape);
        break;
      case "each": {
        const list = lookup(scopes, n.path);
        if (Array.isArray(list)) {
          list.forEach((item, index) => {
            out += renderNodes(n.body, [...scopes, { value: item, index }], escape);
          });
        }
        break;
      }
    }
  }
  return out;
}

/** Render a template. `escape` is false for subjects and plain text bodies. */
export function renderMustache(src: string, data: Record<string, unknown>, opts: { escape?: boolean } = {}): string {
  return renderNodes(parse(src), [{ value: data }], opts.escape ?? true);
}

export function getPath(data: Record<string, unknown>, path: string): unknown {
  return walk(data, path.split("."));
}

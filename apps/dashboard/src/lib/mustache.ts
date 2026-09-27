// Client-side draft preview for the template editor. Mirrors the mailer's core/mustache.ts syntax:
// {{path}} (escaped), {{{raw}}}, {{#if x}}..{{else}}..{{/if}}, {{#each list}}..{{/each}} with {{this}}, {{@index}}.
// The mailer's renderTemplate() only renders the *saved* template, so unsaved edits are previewed with this.
// Syntax errors are returned as text instead of thrown.

type Node =
  | { t: "text"; v: string }
  | { t: "var"; path: string; raw: boolean }
  | { t: "if"; path: string; then: Node[]; else: Node[] }
  | { t: "each"; path: string; body: Node[] };

const TOKEN_RE = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g;

function parse(src: string): Node[] {
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
      if (!top || top.node.t !== "if") throw new Error("{{else}} outside {{#if}}");
      cur = top.node.else;
    } else if (tag === "/if" || tag === "/each") {
      const top = stack.pop();
      if (!top || `/${top.node.t}` !== tag) throw new Error(`unexpected {{${tag}}}`);
      cur = top.target;
    } else if (tag.startsWith("#") || tag.startsWith("/")) {
      throw new Error(`unsupported block {{${tag}}}`);
    } else {
      cur.push({ t: "var", path: tag, raw: false });
    }
  }
  if (last < src.length) cur.push({ t: "text", v: src.slice(last) });
  if (stack.length) throw new Error(`unclosed {{#${stack[stack.length - 1]!.node.t}}}`);
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

function lookup(scopes: Scope[], path: string): unknown {
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

const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== false && v !== "" && v !== 0);
const str = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

function render(nodes: Node[], scopes: Scope[], escape: boolean): string {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") out += n.v;
    else if (n.t === "var") {
      const s = str(lookup(scopes, n.path));
      out += n.raw || !escape ? s : escapeHtml(s);
    } else if (n.t === "if") out += render(truthy(lookup(scopes, n.path)) ? n.then : n.else, scopes, escape);
    else {
      const list = lookup(scopes, n.path);
      if (Array.isArray(list)) list.forEach((item, index) => (out += render(n.body, [...scopes, { value: item, index }], escape)));
    }
  }
  return out;
}

export function renderMustache(src: string, data: Record<string, unknown>, opts: { escape?: boolean } = {}): { out: string; error: string | null } {
  try {
    return { out: render(parse(src), [{ value: data }], opts.escape ?? true), error: null };
  } catch (e) {
    return { out: "", error: e instanceof Error ? e.message : String(e) };
  }
}

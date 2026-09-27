import type { CreateProjectInput, SendEmailInput, UpdateProjectInput } from "@flaresend/types";
import { CliError } from "./api";

/**
 * Split "a@x.com, Name <b@y.com>" on commas, ignoring commas inside quotes or <...>.
 * Empty parts are dropped.
 */
export function splitList(value: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  let inAngle = false;
  for (const ch of value) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === "<" && !inQuote) inAngle = true;
    else if (ch === ">" && !inQuote) inAngle = false;
    if (ch === "," && !inQuote && !inAngle) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** commander collector for repeatable, comma-separated options. */
export function collectList(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), ...splitList(value)];
}

/** commander collector for repeatable options, kept as-is. */
export function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

export function parseIntOption(name: string, value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new CliError(`${name} must be a whole number, got "${value}"`);
  return Number(value);
}

// ---------------------------------------------------------------- send

export interface SendOptions {
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject?: string;
  text?: string;
  html?: string;
  htmlFile?: string;
  template?: string;
  data?: string;
  tag?: string[];
  idempotencyKey?: string;
  scheduledAt?: string;
  project?: string;
}

export interface SendRequest {
  body: SendEmailInput;
  headers: Record<string, string>;
}

function addressField(list: string[] | undefined): string | string[] | undefined {
  if (!list || list.length === 0) return undefined;
  return list.length === 1 ? list[0] : list;
}

export function parseTags(tags: string[] | undefined): Record<string, string> | undefined {
  if (!tags || tags.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const t of tags) {
    const i = t.indexOf("=");
    if (i <= 0) throw new CliError(`--tag must be key=value, got "${t}"`);
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

/**
 * Turn `flaresend send` options into the POST /v1/emails body and headers.
 * `readFile` is used for --html-file (injected so tests do not touch disk).
 */
export function buildSendRequest(opts: SendOptions, readFile: (path: string) => string): SendRequest {
  if (!opts.to || opts.to.length === 0) throw new CliError("--to is required");
  if (opts.html !== undefined && opts.htmlFile !== undefined) throw new CliError("use only one of --html and --html-file");
  if (opts.data !== undefined && !opts.template) throw new CliError("--data needs --template");

  let html = opts.html;
  if (opts.htmlFile !== undefined) {
    try {
      html = readFile(opts.htmlFile);
    } catch (err) {
      throw new CliError(`could not read --html-file ${opts.htmlFile}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (html === undefined && opts.text === undefined && !opts.template) {
    throw new CliError("one of --text, --html, --html-file or --template is required");
  }
  if (!opts.subject && !opts.template) throw new CliError("--subject is required unless --template is set");

  let data: Record<string, unknown> | undefined;
  if (opts.data !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(opts.data);
    } catch {
      throw new CliError("--data must be valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new CliError("--data must be a JSON object");
    data = parsed as Record<string, unknown>;
  }

  let scheduledAt: string | undefined;
  if (opts.scheduledAt !== undefined) {
    const d = new Date(opts.scheduledAt);
    if (Number.isNaN(d.getTime())) throw new CliError(`--scheduled-at must be a date, got "${opts.scheduledAt}"`);
    scheduledAt = d.toISOString();
  }

  const body: SendEmailInput = { to: addressField(opts.to)! };
  if (opts.from) body.from = opts.from;
  const cc = addressField(opts.cc);
  if (cc) body.cc = cc;
  const bcc = addressField(opts.bcc);
  if (bcc) body.bcc = bcc;
  if (opts.replyTo) body.replyTo = opts.replyTo;
  if (opts.subject) body.subject = opts.subject;
  if (opts.text !== undefined) body.text = opts.text;
  if (html !== undefined) body.html = html;
  if (opts.template) body.template = opts.template;
  if (data) body.data = data;
  const tags = parseTags(opts.tag);
  if (tags) body.tags = tags;
  if (scheduledAt) body.scheduledAt = scheduledAt;

  const headers: Record<string, string> = {};
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  return { body, headers };
}

// ---------------------------------------------------------------- projects

export interface ProjectOptions {
  slug?: string;
  name?: string;
  domains?: string;
  defaultFrom?: string;
  senders?: string;
  dailyLimit?: string;
  /** true for --rpc, false for --no-rpc, undefined when neither is given. */
  rpc?: boolean;
}

export function buildCreateProjectBody(opts: ProjectOptions): CreateProjectInput {
  if (!opts.slug) throw new CliError("--slug is required");
  if (!opts.name) throw new CliError("--name is required");
  const allowedDomains = opts.domains ? splitList(opts.domains).map((d) => d.toLowerCase()) : [];
  if (allowedDomains.length === 0) throw new CliError("--domains is required (comma-separated, e.g. a.com,b.com)");

  const body: CreateProjectInput = { slug: opts.slug, name: opts.name, allowedDomains };
  if (opts.defaultFrom) body.defaultFrom = opts.defaultFrom;
  if (opts.senders) {
    const senders = splitList(opts.senders).map((s) => s.toLowerCase());
    if (senders.length) body.allowedSenders = senders;
  }
  if (opts.dailyLimit !== undefined) body.dailyLimit = parseIntOption("--daily-limit", opts.dailyLimit);
  if (opts.rpc !== undefined) body.rpcEnabled = opts.rpc;
  return body;
}

/** An empty string for --default-from or --senders clears that field (sends null). */
export function buildUpdateProjectBody(opts: Omit<ProjectOptions, "slug">): UpdateProjectInput {
  const body: UpdateProjectInput = {};
  if (opts.name !== undefined) body.name = opts.name;
  if (opts.domains !== undefined) {
    const d = splitList(opts.domains).map((x) => x.toLowerCase());
    if (d.length === 0) throw new CliError("--domains cannot be empty");
    body.allowedDomains = d;
  }
  if (opts.defaultFrom !== undefined) body.defaultFrom = opts.defaultFrom === "" ? null : opts.defaultFrom;
  if (opts.senders !== undefined) {
    const s = splitList(opts.senders).map((x) => x.toLowerCase());
    body.allowedSenders = s.length ? s : null;
  }
  if (opts.dailyLimit !== undefined) body.dailyLimit = parseIntOption("--daily-limit", opts.dailyLimit);
  if (opts.rpc !== undefined) body.rpcEnabled = opts.rpc;
  if (Object.keys(body).length === 0) throw new CliError("nothing to update: pass at least one option");
  return body;
}

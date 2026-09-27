import { errorFromBody, networkError, FlaresendError } from "./errors";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | null | undefined;

export interface HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  /** Replaces the timer used between retries. Meant for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  query?: object;
  body?: unknown;
  idempotencyKey?: string;
}

/** Longest `Retry-After` the client will wait. Longer values fail straight away. */
export const MAX_RETRY_AFTER_MS = 60_000;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildQuery(query: object | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Parse `Retry-After` (seconds or an HTTP date) into milliseconds. Null when absent or unreadable. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

function backoff(attempt: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  // "equal jitter": half fixed, half random
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: HttpClientOptions) {
    if (!opts.apiKey) throw new TypeError("Flaresend: apiKey is required");
    if (!opts.baseUrl) throw new TypeError("Flaresend: baseUrl is required (for example https://mailer.yourdomain.com)");
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    // Always call fetch with globalThis as the receiver so Workers do not throw "Illegal invocation".
    const f = opts.fetch ?? globalThis.fetch;
    if (typeof f !== "function") throw new TypeError("Flaresend: no fetch implementation available; pass one in options.fetch");
    // Also covers `fetch: fetch` passed in by the caller, which would otherwise be called with
    // this client as its receiver.
    this.fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => f.call(globalThis, input, init)) as typeof fetch;
    this.maxRetries = Math.max(0, opts.maxRetries ?? 2);
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.baseUrl + path + buildQuery(opts.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    // Reads are always safe to repeat. Writes only when the server can dedupe them.
    const canRetry = method === "GET" || !!opts.idempotencyKey;
    const maxAttempts = canRetry ? this.maxRetries + 1 : 1;

    for (let attempt = 0; ; attempt++) {
      const isLast = attempt + 1 >= maxAttempts;
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method, headers, body });
      } catch (e) {
        if (isLast) throw networkError(e);
        await this.sleep(backoff(attempt));
        continue;
      }

      const text = await res.text();

      if (res.ok) {
        if (!text) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new FlaresendError({
            type: "internal_error",
            code: "invalid_response",
            message: `expected JSON from ${method} ${path}, got: ${text.slice(0, 200)}`,
            status: res.status,
          });
        }
      }

      const err = errorFromBody(res.status, text);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || isLast || err.code === "daily_limit_exceeded") throw err;

      const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
      if (retryAfter !== null && retryAfter > MAX_RETRY_AFTER_MS) throw err;
      await this.sleep(retryAfter ?? backoff(attempt));
    }
  }
}

/**
 * A random key for one send call, reused across that call's retries so a retry never sends twice.
 * Falls back to Math.random where Web Crypto is missing (Node 18 without the global): the key
 * only has to be unique, not secret.
 */
export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `auto_${uuid}`;
  return `auto_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function enc(segment: string): string {
  return encodeURIComponent(segment);
}

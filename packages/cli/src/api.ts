import { ApiErrorShape, FlaresendError, type ErrorType } from "@flaresend/types";

/** A problem on our side of the wire: bad config, network failure, bad input. Printed without a stack trace. */
export class CliError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
    this.name = "CliError";
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
}

export interface ApiOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}

const STATUS_TYPE: Record<number, ErrorType> = {
  400: "validation_error",
  401: "authentication_error",
  403: "permission_error",
  404: "not_found",
  409: "conflict",
  422: "unprocessable",
  429: "rate_limit_error",
};

export function buildUrl(baseUrl: string, path: string, query?: Query): string {
  const url = new URL(baseUrl.replace(/\/+$/, "") + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Small fetch wrapper. Throws FlaresendError for API errors and CliError for network errors. */
export class Api {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiOptions) {
    this.baseUrl = opts.baseUrl;
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, { query });
  }
  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, { body, headers });
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = buildUrl(this.baseUrl, path, opts.query);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      accept: "application/json",
      "user-agent": "flaresend-cli/0.1.0",
      ...opts.headers,
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, { method, headers, body });
    } catch (err) {
      const reason = networkReason(err);
      const hint = reason === "bad port" ? "bad port: Node's fetch refuses to connect to this port, use another one" : reason;
      throw new CliError(`could not reach ${new URL(url).origin} (${hint})`);
    }

    const raw = await res.text();
    let json: unknown = undefined;
    if (raw.length > 0) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = undefined;
      }
    }

    if (!res.ok) {
      const parsed = ApiErrorShape.safeParse((json as { error?: unknown } | undefined)?.error);
      if (parsed.success) throw new FlaresendError({ ...parsed.data, status: res.status });
      throw new FlaresendError({
        type: STATUS_TYPE[res.status] ?? "internal_error",
        code: `http_${res.status}`,
        message: `${method} ${path} returned ${res.status} ${res.statusText}${raw ? `: ${raw.slice(0, 200)}` : ""}`,
        status: res.status,
      });
    }

    if (json === undefined && raw.length > 0) {
      throw new CliError(`${method} ${path} returned a non-JSON response: ${raw.slice(0, 200)}`);
    }
    return json as T;
  }
}

function networkReason(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const c = cause as { code?: string; message?: string; errors?: Array<{ code?: string }> };
      if (c.code) return c.code;
      const inner = c.errors?.find((e) => e.code)?.code;
      if (inner) return inner;
      if (c.message) return c.message;
    }
    return err.message;
  }
  return String(err);
}

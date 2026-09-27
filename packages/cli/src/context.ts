import type { Command } from "commander";
import { Api, CliError } from "./api";
import { json } from "./format";

export interface GlobalOptions {
  baseUrl?: string;
  adminKey?: string;
  apiKey?: string;
  json?: boolean;
}

export interface Ctx {
  json: boolean;
  admin(): Api;
  project(): Api;
  /** Print data as JSON when --json is set, otherwise run the human printer. */
  print<T>(data: T, human: (data: T) => string | void): void;
}

function baseUrl(g: GlobalOptions): string {
  const url = g.baseUrl ?? process.env.FLARESEND_BASE_URL;
  if (!url) throw new CliError("FLARESEND_BASE_URL is not set (or pass --base-url), e.g. http://localhost:8787");
  try {
    new URL(url);
  } catch {
    throw new CliError(`FLARESEND_BASE_URL is not a valid URL: ${url}`);
  }
  return url;
}

export function ctx(cmd: Command): Ctx {
  const g = cmd.optsWithGlobals<GlobalOptions>();
  const asJson = Boolean(g.json);
  return {
    json: asJson,
    admin() {
      const url = baseUrl(g);
      const key = g.adminKey ?? process.env.FLARESEND_ADMIN_KEY;
      if (!key) throw new CliError("FLARESEND_ADMIN_KEY is not set (or pass --admin-key)");
      return new Api({ baseUrl: url, token: key });
    },
    project() {
      const url = baseUrl(g);
      const key = g.apiKey ?? process.env.FLARESEND_API_KEY;
      if (!key) throw new CliError("FLARESEND_API_KEY is not set (or pass --api-key)");
      return new Api({ baseUrl: url, token: key });
    },
    print(data, human) {
      if (asJson) {
        process.stdout.write(json(data) + "\n");
        return;
      }
      const out = human(data);
      if (typeof out === "string" && out.length) process.stdout.write(out + "\n");
    },
  };
}

export const enc = encodeURIComponent;

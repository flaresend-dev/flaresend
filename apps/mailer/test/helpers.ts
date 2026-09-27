import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { vi, type Mock } from "vitest";
import worker from "../src/index";
import { createApiKey, createProject } from "../src/core/admin";
import { getProjectBySlug, type ProjectRow } from "../src/db/projects";
import delivered from "./fixtures/cf-events/delivered.json";
import deferred from "./fixtures/cf-events/deferred.json";
import bounced from "./fixtures/cf-events/bounced.json";
import failed from "./fixtures/cf-events/failed.json";
import rejected from "./fixtures/cf-events/rejected.json";
import complained from "./fixtures/cf-events/complained.json";

export const ADMIN_KEY = "test-admin-key";
export const fixtures = { delivered, deferred, bounced, failed, rejected, complained };
export type FixtureName = keyof typeof fixtures;

export async function call(
  method: string,
  path: string,
  opts: { body?: unknown; key?: string; headers?: Record<string, string>; rawBody?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.key) headers.Authorization = `Bearer ${opts.key}`;
  let body: string | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://mailer.test${path}`, { method, headers, body }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export async function json<T = any>(res: Response | Promise<Response>): Promise<T> {
  return (await (await res).json()) as T;
}

let seq = 0;
export function uniq(prefix = "p"): string {
  return `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
}

export interface TestProject {
  project: ProjectRow;
  slug: string;
  liveKey: string;
  testKey: string;
}

export async function setupProject(overrides: Record<string, unknown> = {}): Promise<TestProject> {
  const slug = uniq("proj");
  await createProject(env, {
    slug,
    name: "Test project",
    defaultFrom: "Acme <hello@acme.com>",
    allowedDomains: ["acme.com"],
    ...overrides,
  });
  const live = await createApiKey(env, slug, { name: "live", mode: "live" });
  const test = await createApiKey(env, slug, { name: "test", mode: "test" });
  return { project: (await getProjectBySlug(env.DB, slug))!, slug, liveKey: live.key, testKey: test.key };
}

export type FakeMessage<T> = Message<T> & {
  ack: Mock<() => void>;
  retry: Mock<(options?: QueueRetryOptions) => void>;
};

export function makeMessage<T>(body: T, attempts = 1): FakeMessage<T> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  } as unknown as FakeMessage<T>;
}

export function makeBatch<T>(queue: string, messages: FakeMessage<T>[]): MessageBatch<T> {
  return {
    queue,
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<T>;
}

/** A fixture event re-pointed at our email and recipient, with a fresh eventId. */
export function cfEvent(name: FixtureName, messageId: string, recipient: string, overrides: { eventId?: string; timestamp?: string } = {}) {
  const ev = structuredClone(fixtures[name]) as any;
  ev.payload.messageId = messageId;
  ev.payload.recipient = recipient;
  ev.payload.eventId = overrides.eventId ?? crypto.randomUUID();
  if (overrides.timestamp) ev.metadata.eventTimestamp = overrides.timestamp;
  return ev;
}

export { env };

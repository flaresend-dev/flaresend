// Dev-only HTTP implementation of AdminRpcApi. Calls the mailer's /v1/admin/* routes with ADMIN_API_KEY.
// Production uses the MAILER_ADMIN service binding instead (see mailer.ts).
import {
  ApiErrorShape, FlaresendError, encodeRpcError,
  type AdminRpcApi, type ProjectRecord,
} from "@flaresend/types";

export type Query = Record<string, string | number | boolean | null | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Joins base + "/v1/admin" + path and appends non-empty query params. Pure; unit tested. */
export function buildUrl(base: string, path: string, query?: Query): string {
  const url = new URL(base.replace(/\/+$/, "") + "/v1/admin" + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

const seg = encodeURIComponent;
const p = (slug: string) => `/projects/${seg(slug)}`;
const q = (v: unknown) => (v ?? undefined) as Query | undefined;

export function createHttpAdminClient(baseUrl: string, adminKey: string, fetchImpl: FetchLike = fetch): AdminRpcApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<any> {
    const url = buildUrl(baseUrl, path, opts.query);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${adminKey}`,
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
      });
    } catch (e) {
      // Same error shape the binding produces, so callers handle both paths the same way.
      throw new Error(encodeRpcError({
        type: "internal_error",
        code: "mailer_unreachable",
        message: `could not reach the mailer at ${baseUrl}: ${e instanceof Error ? e.message : String(e)}`,
      }));
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const parsed = ApiErrorShape.safeParse((json as { error?: unknown } | null)?.error);
      const shape = parsed.success
        ? parsed.data
        : { type: "internal_error" as const, code: `http_${res.status}`, message: text.slice(0, 300) || res.statusText };
      throw new Error(encodeRpcError(shape));
    }
    return json;
  }
  const data = async (pr: Promise<{ data: unknown }>) => (await pr).data as never;

  let projectCache: ProjectRecord[] | null = null;
  async function slugForProjectId(projectId: string): Promise<string> {
    const find = (list: ProjectRecord[]) => list.find((x) => x.id === projectId)?.slug;
    let slug = projectCache ? find(projectCache) : undefined;
    if (!slug) {
      projectCache = (await call("GET", "/projects")).data as ProjectRecord[];
      slug = find(projectCache);
    }
    if (!slug) {
      throw new Error(encodeRpcError(new FlaresendError({ type: "not_found", code: "project_not_found", message: `no project with id ${projectId}` }).toJSON()));
    }
    return slug;
  }
  /** cancel/reschedule only exist on the project-scoped route; look the project up from the email id. */
  async function emailScope(id: string): Promise<string> {
    const email = (await call("GET", `/emails/${seg(id)}`)) as { projectId: string };
    return `${p(await slugForProjectId(email.projectId))}/emails/${seg(id)}`;
  }

  return {
    // projects
    listProjects: () => data(call("GET", "/projects")),
    getProject: (slug) => call("GET", p(slug)),
    createProject: (input) => call("POST", "/projects", { body: input }),
    updateProject: (slug, patch) => call("PATCH", p(slug), { body: patch }),
    disableProject: (slug) => call("DELETE", p(slug)),
    listDomains: (slug, opts) => data(call("GET", `${p(slug)}/domains`, { query: { refresh: opts?.refresh ? "1" : undefined } })),
    setupDomain: (slug, domain) => call("POST", `${p(slug)}/domains/${seg(domain)}/setup`),

    // keys
    listApiKeys: (slug) => data(call("GET", "/api-keys", { query: { project: slug ?? undefined } })),
    createApiKey: (slug, input) => call("POST", `${p(slug)}/api-keys`, { body: input }),
    renameApiKey: (id, name) => call("PATCH", `/api-keys/${seg(id)}`, { body: { name } }),
    revokeApiKey: (id) => call("DELETE", `/api-keys/${seg(id)}`),

    // emails
    listEmails: (query) => call("GET", "/emails", { query: q(query) }),
    getEmail: (id) => call("GET", `/emails/${seg(id)}`),
    getContent: (id) => call("GET", `/emails/${seg(id)}/content`),
    resendEmail: (id) => call("POST", `/emails/${seg(id)}/resend`),
    cancelEmail: async (id) => call("DELETE", await emailScope(id)),
    rescheduleEmail: async (id, scheduledAt) => call("PATCH", await emailScope(id), { body: { scheduledAt } }),
    sendEmail: (slug, input) => call("POST", `${p(slug)}/emails`, { body: input }),
    listEvents: (query) => call("GET", "/events", { query: q(query) }),

    // suppressions, stats, analytics
    listSuppressions: (query) => call("GET", "/suppressions", { query: q(query) }),
    addSuppression: (input) => call("POST", "/suppressions", { body: input }),
    removeSuppression: (address) => call("DELETE", `/suppressions/${seg(address)}`),
    stats: () => data(call("GET", "/stats")),
    info: () => call("GET", "/info"),
    analytics: (query) => call("GET", "/analytics", { query: q(query) }),

    // webhooks
    listWebhooks: (slug) => data(call("GET", `${p(slug)}/webhooks`)),
    createWebhook: (slug, input) => call("POST", `${p(slug)}/webhooks`, { body: input }),
    getWebhook: (slug, id) => call("GET", `${p(slug)}/webhooks/${seg(id)}`),
    updateWebhook: (slug, id, patch) => call("PATCH", `${p(slug)}/webhooks/${seg(id)}`, { body: patch }),
    deleteWebhook: (slug, id) => call("DELETE", `${p(slug)}/webhooks/${seg(id)}`),
    testWebhook: (slug, id) => call("POST", `${p(slug)}/webhooks/${seg(id)}/test`),
    rotateWebhookSecret: (slug, id) => call("POST", `${p(slug)}/webhooks/${seg(id)}/rotate-secret`),
    listWebhookDeliveries: (slug, id, query) => call("GET", `${p(slug)}/webhooks/${seg(id)}/deliveries`, { query: q(query) }),

    // templates
    listTemplates: (slug) => data(call("GET", `${p(slug)}/templates`)),
    getTemplate: (slug, name) => call("GET", `${p(slug)}/templates/${seg(name)}`),
    createTemplate: (slug, input) => call("POST", `${p(slug)}/templates`, { body: input }),
    updateTemplate: (slug, name, patch) => call("PATCH", `${p(slug)}/templates/${seg(name)}`, { body: patch }),
    deleteTemplate: (slug, name) => call("DELETE", `${p(slug)}/templates/${seg(name)}`),
    templateVersions: (slug, name) => data(call("GET", `${p(slug)}/templates/${seg(name)}/versions`)),
    restoreTemplate: (slug, name, version) => call("POST", `${p(slug)}/templates/${seg(name)}/restore`, { body: { version } }),
    renderTemplate: (slug, name, d) => call("POST", `${p(slug)}/templates/${seg(name)}/render`, { body: { data: d ?? {} } }),

    // contacts + audiences
    listContacts: (slug, query) => call("GET", `${p(slug)}/contacts`, { query: q(query) }),
    upsertContact: (slug, input) => call("POST", `${p(slug)}/contacts`, { body: input }),
    getContact: (slug, id) => call("GET", `${p(slug)}/contacts/${seg(id)}`),
    updateContact: (slug, id, patch) => call("PATCH", `${p(slug)}/contacts/${seg(id)}`, { body: patch }),
    deleteContact: (slug, id) => call("DELETE", `${p(slug)}/contacts/${seg(id)}`),
    importContacts: (slug, contacts) => call("POST", `${p(slug)}/contacts/import`, { body: contacts }),
    listAudiences: (slug) => data(call("GET", `${p(slug)}/audiences`)),
    createAudience: (slug, name) => call("POST", `${p(slug)}/audiences`, { body: { name } }),
    getAudience: (slug, id) => call("GET", `${p(slug)}/audiences/${seg(id)}`),
    renameAudience: (slug, id, name) => call("PATCH", `${p(slug)}/audiences/${seg(id)}`, { body: { name } }),
    deleteAudience: (slug, id) => call("DELETE", `${p(slug)}/audiences/${seg(id)}`),
    listAudienceContacts: (slug, id, query) => call("GET", `${p(slug)}/audiences/${seg(id)}/contacts`, { query: q(query) }),
    addAudienceContacts: (slug, id, contactIds) => call("POST", `${p(slug)}/audiences/${seg(id)}/contacts`, { body: { contactIds } }),
    removeAudienceContacts: (slug, id, contactIds) => call("DELETE", `${p(slug)}/audiences/${seg(id)}/contacts`, { body: { contactIds } }),

    // broadcasts
    listBroadcasts: (slug) => data(call("GET", `${p(slug)}/broadcasts`)),
    createBroadcast: (slug, input) => call("POST", `${p(slug)}/broadcasts`, { body: input }),
    getBroadcast: (slug, id) => call("GET", `${p(slug)}/broadcasts/${seg(id)}`),
    updateBroadcast: (slug, id, patch) => call("PATCH", `${p(slug)}/broadcasts/${seg(id)}`, { body: patch }),
    deleteBroadcast: (slug, id) => call("DELETE", `${p(slug)}/broadcasts/${seg(id)}`),
    sendBroadcast: (slug, id, scheduledAt) =>
      call("POST", `${p(slug)}/broadcasts/${seg(id)}/send`, { body: scheduledAt ? { scheduledAt } : {} }),
    cancelBroadcast: (slug, id) => call("POST", `${p(slug)}/broadcasts/${seg(id)}/cancel`),
  };
}

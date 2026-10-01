import type { NewsletterApi, NewsletterPageQuery } from "./newsletters";
type WithoutProject<T extends unknown[]> = T extends [string, ...infer R]
  ? R
  : never;
export type BoundNewsletterApi = {
  [K in keyof NewsletterApi]: (
    ...args: WithoutProject<Parameters<NewsletterApi[K]>>
  ) => ReturnType<NewsletterApi[K]>;
};
export function bindNewsletterApi(
  api: NewsletterApi,
  project: string,
): BoundNewsletterApi {
  return Object.fromEntries(
    Object.keys(api).map((name) => [
      name,
      (...args: unknown[]) =>
        Reflect.apply(Reflect.get(api, name), api, [project, ...args]),
    ]),
  ) as BoundNewsletterApi;
}
export type NewsletterHttpCall = <T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts?: { query?: Record<string, unknown>; body?: unknown },
) => Promise<T>;
/** Shared REST adapter for the SDK and dashboard HTTP fallback. */
export function newsletterHttpApi(
  call: NewsletterHttpCall,
  scope: (slug: string) => string,
): NewsletterApi {
  const enc = encodeURIComponent;
  const pub = (slug: string, id: string) =>
    `${scope(slug)}/publications/${enc(id)}`;
  const post = (slug: string, id: string, pid: string) =>
    `${pub(slug, id)}/posts/${enc(pid)}`;
  const sub = (slug: string, id: string, sid: string) =>
    `${pub(slug, id)}/subscribers/${enc(sid)}`;
  const query = (q?: NewsletterPageQuery) =>
    q
      ? { ...q, filter: q.filter ? JSON.stringify(q.filter) : undefined }
      : undefined;
  return {
    newsletterCapabilities: (s, id) =>
      call("GET", `${scope(s)}/newsletter-capabilities`, {
        query: { publicationId: id },
      }),
    listPublications: (s, q) =>
      call("GET", `${scope(s)}/publications`, { query: query(q) }),
    createPublication: (s, input) =>
      call("POST", `${scope(s)}/publications`, { body: input }),
    getPublication: (s, id) => call("GET", pub(s, id)),
    updatePublication: (s, id, input) =>
      call("PATCH", pub(s, id), { body: input }),
    archivePublication: (s, id, expectedRevision) =>
      call("POST", `${pub(s, id)}/archive`, { body: { expectedRevision } }),
    listNewsletterPosts: (s, id, q) =>
      call("GET", `${pub(s, id)}/posts`, { query: query(q) }),
    createNewsletterPost: (s, id, input) =>
      call("POST", `${pub(s, id)}/posts`, { body: input }),
    getNewsletterPost: (s, id, pid) => call("GET", post(s, id, pid)),
    updateNewsletterPost: (s, id, pid, input) =>
      call("PATCH", post(s, id, pid), { body: input }),
    newsletterPostCommand: (s, id, pid, command, expectedRevision) =>
      call(
        command === "delete" ? "DELETE" : "POST",
        `${post(s, id, pid)}${command === "delete" ? "" : `/${command}`}`,
        { body: { expectedRevision } },
      ),
    publishNewsletterWeb: (s, id, pid, input) =>
      call("POST", `${post(s, id, pid)}/publish-web`, { body: input }),
    previewNewsletterPost: (s, id, pid, target, subscriptionId) =>
      call("POST", `${post(s, id, pid)}/preview`, {
        body: { target, subscriptionId },
      }),
    reviewNewsletterPost: (s, id, pid, filter) =>
      call("POST", `${post(s, id, pid)}/review`, { body: { filter } }),
    sendNewsletterEmail: (s, id, pid, input) =>
      call("POST", `${post(s, id, pid)}/send-email`, { body: input }),
    sendNewsletterTest: (s, id, pid, input) =>
      call("POST", `${post(s, id, pid)}/send-test`, { body: input }),
    listNewsletterEmailRuns: (s, id, q) =>
      call("GET", `${pub(s, id)}/email-runs`, { query: q }),
    getNewsletterEmailRun: (s, id, runId) =>
      call("GET", `${pub(s, id)}/email-runs/${enc(runId)}`),
    listNewsletterRunRecipients: (s, id, runId, q) =>
      call("GET", `${pub(s, id)}/email-runs/${enc(runId)}/recipients`, {
        query: q,
      }),
    cancelNewsletterEmailRun: (s, id, runId) =>
      call("POST", `${pub(s, id)}/email-runs/${enc(runId)}/cancel`),
    newsletterAi: (s, id, input) =>
      call("POST", `${pub(s, id)}/ai`, { body: input }),
    listNewsletterSubscribers: (s, id, q) =>
      call("GET", `${pub(s, id)}/subscribers`, { query: query(q) }),
    getNewsletterSubscriber: (s, id, sid) => call("GET", sub(s, id, sid)),
    updateNewsletterSubscriber: (s, id, sid, input) =>
      call("PATCH", sub(s, id, sid), { body: input }),
    unsubscribeNewsletterSubscriber: (s, id, sid, expectedRevision) =>
      call("POST", `${sub(s, id, sid)}/unsubscribe`, {
        body: { expectedRevision },
      }),
    deleteNewsletterSubscriber: (s, id, sid, expectedRevision) =>
      call("DELETE", sub(s, id, sid), { body: { expectedRevision } }),
    listNewsletterTags: (s, id) =>
      call<{ data: Awaited<ReturnType<NewsletterApi["listNewsletterTags"]>> }>(
        "GET",
        `${pub(s, id)}/tags`,
      ).then((r) => r.data),
    createNewsletterTag: (s, id, name) =>
      call("POST", `${pub(s, id)}/tags`, { body: { name } }),
    deleteNewsletterTag: (s, id, tid) =>
      call("DELETE", `${pub(s, id)}/tags/${enc(tid)}`),
    uploadNewsletterAsset: (s, id, input) =>
      call("POST", `${pub(s, id)}/assets`, { body: input }),
    getNewsletterAsset: (s, id, aid) =>
      call("GET", `${pub(s, id)}/assets/${enc(aid)}`),
    previewNewsletterImport: (s, id, input) =>
      call("POST", `${pub(s, id)}/imports/preview`, { body: input }),
    startNewsletterImport: (s, id, input) =>
      call("POST", `${pub(s, id)}/imports`, { body: input }),
    importNewsletterAudience: (s, id, input) =>
      call("POST", `${pub(s, id)}/imports/from-audience`, { body: input }),
    getNewsletterImport: (s, id, iid) =>
      call("GET", `${pub(s, id)}/imports/${enc(iid)}`),
    exportNewsletterSubscribers: (s, id, filter) =>
      call("POST", `${pub(s, id)}/export`, { body: { filter } }),
    newsletterReports: (s, id, input) =>
      call("GET", `${pub(s, id)}/reports`, { query: input }),
  };
}

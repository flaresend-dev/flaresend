// AdminRpc: the dashboard's service-binding entrypoint. Same core functions as /v1/admin/*.
import { WorkerEntrypoint } from "cloudflare:workers";
import type { AdminRpcApi } from "@flaresend/types";
import * as admin from "./core/admin";
import { getAnalytics } from "./core/analytics";
import * as broadcasts from "./core/broadcasts";
import * as contacts from "./core/contacts";
import { listAllDomainRecords, listDomainRecords, setupDomain } from "./core/domains";
import * as emails from "./core/emails";
import { sendEmail } from "./core/send";
import * as templates from "./core/templates";
import * as webhooks from "./core/webhooks";
import { getMailerInfo } from "./core/mailer-info";
import { toRpcError } from "./http/errors";

type Api = AdminRpcApi;
type Handlers = {
  [K in keyof Api]: (env: Env, ctx: ExecutionContext, ...args: Parameters<Api[K]>) => ReturnType<Api[K]>;
};

const pid = async (env: Env, slug: string) => (await admin.requireProjectBySlug(env, slug)).id;
const project = (env: Env, slug: string) => admin.requireProjectBySlug(env, slug);
const optionalPid = async (env: Env, slug?: string | null) => (slug ? pid(env, slug) : null);

export const adminHandlers: Handlers = {
  // projects
  listProjects: async (env) => admin.listProjectRecords(env),
  getProject: async (env, _ctx, slug) => admin.getProjectRecord(env, slug),
  createProject: async (env, _ctx, input) => admin.createProject(env, input),
  updateProject: async (env, _ctx, slug, patch) => admin.patchProject(env, slug, patch),
  disableProject: async (env, _ctx, slug) => admin.disableProject(env, slug),
  listDomains: async (env, _ctx, slug, opts) => listDomainRecords(env, await project(env, slug), opts ?? {}),
  listAllDomains: async (env, _ctx, opts) => listAllDomainRecords(env, opts ?? {}),
  setupDomain: async (env, _ctx, slug, domain) => setupDomain(env, await project(env, slug), domain),

  // keys
  listApiKeys: async (env, _ctx, slug) => admin.listApiKeyRecords(env, slug),
  createApiKey: async (env, _ctx, slug, input) => admin.createApiKey(env, slug, input),
  renameApiKey: async (env, _ctx, id, name) => admin.renameKey(env, id, { name }),
  revokeApiKey: async (env, _ctx, id) => admin.revokeKey(env, id),

  // emails
  listEmails: async (env, _ctx, query = {}) => {
    const { project: slug, ...rest } = query;
    return emails.listEmailRecords(env, emails.parseListEmailsQuery(rest), await optionalPid(env, slug));
  },
  getEmail: async (env, _ctx, id) => emails.getEmailRecord(env, id, null),
  getContent: async (env, _ctx, id) => emails.getEmailContent(env, id, null),
  resendEmail: async (env, ctx, id) => admin.resendEmail(env, id, null, (p) => ctx.waitUntil(p)),
  cancelEmail: async (env, _ctx, id) => emails.cancelEmail(env, id, null),
  rescheduleEmail: async (env, _ctx, id, scheduledAt) => emails.rescheduleEmail(env, id, scheduledAt, null),
  sendEmail: async (env, ctx, slug, input) =>
    sendEmail(env, { project: await project(env, slug), mode: "live", source: "http", apiKeyId: null, waitUntil: (p) => ctx.waitUntil(p) }, input),
  listEvents: async (env, _ctx, query = {}) => {
    const { project: slug, ...rest } = query;
    return emails.listEventRecords(env, rest, await optionalPid(env, slug));
  },

  // suppressions, stats, analytics
  listSuppressions: async (env, _ctx, query = {}) => admin.listSuppressionRecords(env, query),
  addSuppression: async (env, _ctx, input) => admin.addSuppression(env, input),
  removeSuppression: async (env, _ctx, address) => admin.removeSuppression(env, address),
  stats: async (env) => admin.getStats(env),
  info: async (env) => getMailerInfo(env),
  analytics: async (env, _ctx, query = {}) => {
    const { project: slug, ...rest } = query;
    return getAnalytics(env, rest, await optionalPid(env, slug));
  },

  // webhooks
  listWebhooks: async (env, _ctx, slug) => webhooks.listWebhookRecords(env, await pid(env, slug)),
  createWebhook: async (env, _ctx, slug, input) => webhooks.createWebhook(env, await pid(env, slug), input),
  getWebhook: async (env, _ctx, slug, id) => webhooks.getWebhookRecord(env, await pid(env, slug), id),
  updateWebhook: async (env, _ctx, slug, id, patch) => webhooks.patchWebhook(env, await pid(env, slug), id, patch),
  deleteWebhook: async (env, _ctx, slug, id) => webhooks.removeWebhook(env, await pid(env, slug), id),
  testWebhook: async (env, _ctx, slug, id) => webhooks.testWebhook(env, await pid(env, slug), id),
  rotateWebhookSecret: async (env, _ctx, slug, id) => webhooks.rotateWebhookSecret(env, await pid(env, slug), id),
  listWebhookDeliveries: async (env, _ctx, slug, id, query = {}) => webhooks.listWebhookDeliveries(env, await pid(env, slug), id, query),

  // templates
  listTemplates: async (env, _ctx, slug) => templates.listTemplateRecords(env, await pid(env, slug)),
  getTemplate: async (env, _ctx, slug, name) => templates.getTemplateRecord(env, await pid(env, slug), name),
  createTemplate: async (env, _ctx, slug, input) => templates.createTemplate(env, await pid(env, slug), input),
  updateTemplate: async (env, _ctx, slug, name, patch) => templates.patchTemplate(env, await pid(env, slug), name, patch),
  deleteTemplate: async (env, _ctx, slug, name) => templates.removeTemplate(env, await pid(env, slug), name),
  templateVersions: async (env, _ctx, slug, name) => templates.listTemplateVersionRecords(env, await pid(env, slug), name),
  restoreTemplate: async (env, _ctx, slug, name, version) => templates.restoreTemplate(env, await pid(env, slug), name, { version }),
  renderTemplate: async (env, _ctx, slug, name, data = {}) => templates.renderTemplatePreview(env, await pid(env, slug), name, { data }),

  // contacts + audiences
  listContacts: async (env, _ctx, slug, query = {}) => contacts.listContacts(env, await pid(env, slug), query),
  upsertContact: async (env, _ctx, slug, input) => contacts.upsertContact(env, await pid(env, slug), input),
  getContact: async (env, _ctx, slug, id) => contacts.getContact(env, await pid(env, slug), id),
  updateContact: async (env, _ctx, slug, id, patch) => contacts.patchContact(env, await pid(env, slug), id, patch),
  deleteContact: async (env, _ctx, slug, id) => contacts.removeContact(env, await pid(env, slug), id),
  importContacts: async (env, _ctx, slug, list) => contacts.importContacts(env, await pid(env, slug), list),
  listAudiences: async (env, _ctx, slug) => contacts.listAudiences(env, await pid(env, slug)),
  createAudience: async (env, _ctx, slug, name) => contacts.createAudience(env, await pid(env, slug), { name }),
  getAudience: async (env, _ctx, slug, id) => contacts.getAudience(env, await pid(env, slug), id),
  renameAudience: async (env, _ctx, slug, id, name) => contacts.renameAudience(env, await pid(env, slug), id, { name }),
  deleteAudience: async (env, _ctx, slug, id) => contacts.removeAudience(env, await pid(env, slug), id),
  listAudienceContacts: async (env, _ctx, slug, id, query = {}) => contacts.listAudienceContacts(env, await pid(env, slug), id, query),
  addAudienceContacts: async (env, _ctx, slug, id, contactIds) => contacts.addAudienceContacts(env, await pid(env, slug), id, { contactIds }),
  removeAudienceContacts: async (env, _ctx, slug, id, contactIds) => contacts.removeAudienceContacts(env, await pid(env, slug), id, { contactIds }),

  // broadcasts
  listBroadcasts: async (env, _ctx, slug) => broadcasts.listBroadcasts(env, await pid(env, slug)),
  createBroadcast: async (env, _ctx, slug, input) => broadcasts.createBroadcast(env, await project(env, slug), input),
  getBroadcast: async (env, _ctx, slug, id) => broadcasts.getBroadcast(env, await pid(env, slug), id),
  updateBroadcast: async (env, _ctx, slug, id, patch) => broadcasts.patchBroadcast(env, await project(env, slug), id, patch),
  deleteBroadcast: async (env, _ctx, slug, id) => broadcasts.removeBroadcast(env, await pid(env, slug), id),
  sendBroadcast: async (env, _ctx, slug, id, scheduledAt) =>
    broadcasts.startBroadcast(env, await project(env, slug), id, scheduledAt ? { scheduledAt } : {}),
  cancelBroadcast: async (env, _ctx, slug, id) => broadcasts.cancelBroadcast(env, await pid(env, slug), id),
};

/**
 * Workers RPC only exposes methods on the class prototype, so each handler is installed as a real
 * prototype method below. Errors are re-thrown in the encoded form @flaresend/types can decode.
 */
export class AdminRpc extends WorkerEntrypoint<Env> {}
// Declaration merging gives the class the AdminRpcApi method types.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface AdminRpc extends Api {}

type AnyHandler = (env: Env, ctx: ExecutionContext, ...args: unknown[]) => Promise<unknown>;
for (const [name, fn] of Object.entries(adminHandlers) as Array<[string, AnyHandler]>) {
  Object.defineProperty(AdminRpc.prototype, name, {
    value: async function (this: AdminRpc, ...args: unknown[]) {
      const self = this as unknown as { env: Env; ctx: ExecutionContext };
      try {
        return await fn(self.env, self.ctx, ...args);
      } catch (err) {
        throw toRpcError(err);
      }
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

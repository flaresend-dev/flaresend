import type { NewsletterApi } from "@flaresend/types";
import { requireProjectBySlug } from "../admin";
import * as publications from "./publications";
import * as posts from "./posts";
import * as subscriptions from "./subscriptions";
import * as imports from "./imports";
import * as assets from "./assets";
import { capabilities } from "./policy";
import * as delivery from "./delivery";
import { aiRun } from "./ai";
import { reports } from "./reports";
type Handlers = {
  [K in keyof NewsletterApi]: (
    env: Env,
    ctx: ExecutionContext,
    ...args: Parameters<NewsletterApi[K]>
  ) => ReturnType<NewsletterApi[K]>;
};
const project = requireProjectBySlug;
export const newsletterAdminHandlers: Handlers = {
  newsletterCapabilities: async (e, _c, s, id) =>
    capabilities(e, await project(e, s), id),
  listPublications: async (e, _c, s, q) =>
    publications.listPublications(e, await project(e, s), q),
  createPublication: async (e, _c, s, input) =>
    publications.createPublication(e, await project(e, s), input),
  getPublication: async (e, _c, s, id) =>
    publications.getPublication(e, await project(e, s), id),
  updatePublication: async (e, _c, s, id, input) =>
    publications.updatePublication(e, await project(e, s), id, input),
  archivePublication: async (e, _c, s, id, r) =>
    publications.archivePublication(e, await project(e, s), id, r),
  listNewsletterPosts: async (e, _c, s, id, q) =>
    posts.listPosts(e, await project(e, s), id, q),
  createNewsletterPost: async (e, _c, s, id, input) =>
    posts.createPost(e, await project(e, s), id, input),
  getNewsletterPost: async (e, _c, s, id, pid) =>
    posts.getPost(e, await project(e, s), id, pid),
  updateNewsletterPost: async (e, _c, s, id, pid, input) =>
    posts.updatePost(e, await project(e, s), id, pid, input),
  newsletterPostCommand: async (e, _c, s, id, pid, command, r) =>
    posts.postCommand(e, await project(e, s), id, pid, command, r),
  publishNewsletterWeb: async (e, _c, s, id, pid, input) =>
    posts.publishWeb(e, await project(e, s), id, pid, input),
  previewNewsletterPost: async (e, _c, s, id, pid, target, sid) =>
    posts.previewPost(e, await project(e, s), id, pid, target, sid),
  reviewNewsletterPost: async (e, _c, s, id, pid, filter) =>
    posts.reviewPost(e, await project(e, s), id, pid, filter),
  sendNewsletterEmail: async (e, _c, s, id, pid, input) =>
    delivery.createRun(e, await project(e, s), id, pid, input),
  sendNewsletterTest: async (e, _c, s, id, pid, input) =>
    delivery.sendTest(e, await project(e, s), id, pid, input),
  listNewsletterEmailRuns: async (e, _c, s, id, q) =>
    delivery.listRuns(e, await project(e, s), id, q),
  getNewsletterEmailRun: async (e, _c, s, id, runId) =>
    delivery.getRun(e, await project(e, s), id, runId),
  listNewsletterRunRecipients: async (e, _c, s, id, runId, q) =>
    delivery.listRunRecipients(e, await project(e, s), id, runId, q),
  cancelNewsletterEmailRun: async (e, _c, s, id, runId) =>
    delivery.cancelRun(e, await project(e, s), id, runId),
  newsletterAi: async (e, _c, s, id, input) =>
    aiRun(e, await project(e, s), id, input),
  listNewsletterSubscribers: async (e, _c, s, id, q) =>
    subscriptions.listSubscribers(e, await project(e, s), id, q),
  getNewsletterSubscriber: async (e, _c, s, id, sid) =>
    subscriptions.getSubscriber(e, await project(e, s), id, sid),
  updateNewsletterSubscriber: async (e, _c, s, id, sid, input) =>
    subscriptions.updateSubscriber(e, await project(e, s), id, sid, input),
  unsubscribeNewsletterSubscriber: async (e, _c, s, id, sid, r) =>
    subscriptions.unsubscribe(e, await project(e, s), id, sid, r),
  deleteNewsletterSubscriber: async (e, _c, s, id, sid, r) =>
    subscriptions.deleteSubscriber(e, await project(e, s), id, sid, r),
  listNewsletterTags: async (e, _c, s, id) =>
    subscriptions.listTags(e, await project(e, s), id),
  createNewsletterTag: async (e, _c, s, id, name) =>
    subscriptions.createTag(e, await project(e, s), id, name),
  deleteNewsletterTag: async (e, _c, s, id, tid) =>
    subscriptions.deleteTag(e, await project(e, s), id, tid),
  uploadNewsletterAsset: async (e, _c, s, id, input) =>
    assets.uploadAsset(e, await project(e, s), id, input),
  getNewsletterAsset: async (e, _c, s, id, aid) =>
    assets.getAsset(e, await project(e, s), id, aid),
  previewNewsletterImport: async (e, _c, s, id, input) =>
    imports.previewImport(e, await project(e, s), id, input),
  startNewsletterImport: async (e, _c, s, id, input) =>
    imports.startImport(e, await project(e, s), id, input),
  importNewsletterAudience: async (e, _c, s, id, input) =>
    imports.importAudience(e, await project(e, s), id, input),
  getNewsletterImport: async (e, _c, s, id, iid) =>
    imports.getImport(e, await project(e, s), id, iid),
  exportNewsletterSubscribers: async (e, _c, s, id, f) =>
    imports.exportSubscribers(e, await project(e, s), id, f),
  newsletterReports: async (e, _c, s, id, input) =>
    reports(e, await project(e, s), id, input),
};

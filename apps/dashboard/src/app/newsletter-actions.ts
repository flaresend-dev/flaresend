"use server";
import { revalidatePath } from "next/cache";
import type { NewsletterApi } from "@flaresend/types";
import { mailerCall, type Result } from "@/lib/mailer";
type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;
type Op<K extends keyof NewsletterApi> = {
  /** True when a successful call changes data, so the newsletter pages must be revalidated. */
  mutates: boolean;
  run: (
    m: NewsletterApi,
    slug: string,
    args: Tail<Parameters<NewsletterApi[K]>>,
  ) => Promise<Awaited<ReturnType<NewsletterApi[K]>>>;
};
/**
 * One entry per operation, each calling its method by name. With the service binding, `m` is an RPC stub: every
 * property on it (including a function's `.call`) is treated as a remote method name, so the method must be called
 * directly on `m`. Naming each call here also means the client-supplied `method` string never picks a property on `m`.
 */
const OPS: { [K in keyof NewsletterApi]: Op<K> } = {
  newsletterCapabilities: { mutates: false, run: (m, s, a) => m.newsletterCapabilities(s, ...a) },
  listPublications: { mutates: false, run: (m, s, a) => m.listPublications(s, ...a) },
  createPublication: { mutates: true, run: (m, s, a) => m.createPublication(s, ...a) },
  getPublication: { mutates: false, run: (m, s, a) => m.getPublication(s, ...a) },
  updatePublication: { mutates: true, run: (m, s, a) => m.updatePublication(s, ...a) },
  archivePublication: { mutates: true, run: (m, s, a) => m.archivePublication(s, ...a) },
  listNewsletterPosts: { mutates: false, run: (m, s, a) => m.listNewsletterPosts(s, ...a) },
  createNewsletterPost: { mutates: true, run: (m, s, a) => m.createNewsletterPost(s, ...a) },
  getNewsletterPost: { mutates: false, run: (m, s, a) => m.getNewsletterPost(s, ...a) },
  updateNewsletterPost: { mutates: true, run: (m, s, a) => m.updateNewsletterPost(s, ...a) },
  newsletterPostCommand: { mutates: true, run: (m, s, a) => m.newsletterPostCommand(s, ...a) },
  publishNewsletterWeb: { mutates: true, run: (m, s, a) => m.publishNewsletterWeb(s, ...a) },
  previewNewsletterPost: { mutates: false, run: (m, s, a) => m.previewNewsletterPost(s, ...a) },
  reviewNewsletterPost: { mutates: false, run: (m, s, a) => m.reviewNewsletterPost(s, ...a) },
  sendNewsletterEmail: { mutates: true, run: (m, s, a) => m.sendNewsletterEmail(s, ...a) },
  sendNewsletterTest: { mutates: false, run: (m, s, a) => m.sendNewsletterTest(s, ...a) },
  listNewsletterEmailRuns: { mutates: false, run: (m, s, a) => m.listNewsletterEmailRuns(s, ...a) },
  getNewsletterEmailRun: { mutates: false, run: (m, s, a) => m.getNewsletterEmailRun(s, ...a) },
  listNewsletterRunRecipients: { mutates: false, run: (m, s, a) => m.listNewsletterRunRecipients(s, ...a) },
  cancelNewsletterEmailRun: { mutates: true, run: (m, s, a) => m.cancelNewsletterEmailRun(s, ...a) },
  newsletterAi: { mutates: false, run: (m, s, a) => m.newsletterAi(s, ...a) },
  listNewsletterSubscribers: { mutates: false, run: (m, s, a) => m.listNewsletterSubscribers(s, ...a) },
  getNewsletterSubscriber: { mutates: false, run: (m, s, a) => m.getNewsletterSubscriber(s, ...a) },
  updateNewsletterSubscriber: { mutates: true, run: (m, s, a) => m.updateNewsletterSubscriber(s, ...a) },
  unsubscribeNewsletterSubscriber: { mutates: true, run: (m, s, a) => m.unsubscribeNewsletterSubscriber(s, ...a) },
  deleteNewsletterSubscriber: { mutates: true, run: (m, s, a) => m.deleteNewsletterSubscriber(s, ...a) },
  listNewsletterTags: { mutates: false, run: (m, s, a) => m.listNewsletterTags(s, ...a) },
  createNewsletterTag: { mutates: true, run: (m, s, a) => m.createNewsletterTag(s, ...a) },
  deleteNewsletterTag: { mutates: true, run: (m, s, a) => m.deleteNewsletterTag(s, ...a) },
  uploadNewsletterAsset: { mutates: false, run: (m, s, a) => m.uploadNewsletterAsset(s, ...a) },
  getNewsletterAsset: { mutates: false, run: (m, s, a) => m.getNewsletterAsset(s, ...a) },
  previewNewsletterImport: { mutates: false, run: (m, s, a) => m.previewNewsletterImport(s, ...a) },
  startNewsletterImport: { mutates: true, run: (m, s, a) => m.startNewsletterImport(s, ...a) },
  importNewsletterAudience: { mutates: true, run: (m, s, a) => m.importNewsletterAudience(s, ...a) },
  getNewsletterImport: { mutates: false, run: (m, s, a) => m.getNewsletterImport(s, ...a) },
  exportNewsletterSubscribers: { mutates: false, run: (m, s, a) => m.exportNewsletterSubscribers(s, ...a) },
  newsletterReports: { mutates: false, run: (m, s, a) => m.newsletterReports(s, ...a) },
};
/** Keep every dashboard operation on the same typed RPC/HTTP contract. */
export async function newsletterAction<K extends keyof NewsletterApi>(
  slug: string,
  method: K,
  ...args: Tail<Parameters<NewsletterApi[K]>>
): Promise<Result<Awaited<ReturnType<NewsletterApi[K]>>>> {
  if (!Object.hasOwn(OPS, method)) throw new Error("Unknown newsletter operation.");
  const op = OPS[method] as Op<K>;
  const result = await mailerCall((m) => op.run(m, slug, args));
  if (result.ok && op.mutates) {
    revalidatePath(`/${slug}/newsletters`, "layout");
    revalidatePath("/all/newsletters", "layout");
  }
  return result as Result<Awaited<ReturnType<NewsletterApi[K]>>>;
}

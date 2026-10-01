"use server";
import { revalidatePath } from "next/cache";
import type { NewsletterApi } from "@flaresend/types";
import { mailerCall, type Result } from "@/lib/mailer";
type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;
/** Keep every dashboard operation on the same typed RPC/HTTP contract. */
export async function newsletterAction<K extends keyof NewsletterApi>(
  slug: string,
  method: K,
  ...args: Tail<Parameters<NewsletterApi[K]>>
): Promise<Result<Awaited<ReturnType<NewsletterApi[K]>>>> {
  const allowed = new Set<string>([
    "newsletterCapabilities",
    "listPublications",
    "createPublication",
    "getPublication",
    "updatePublication",
    "archivePublication",
    "listNewsletterPosts",
    "createNewsletterPost",
    "getNewsletterPost",
    "updateNewsletterPost",
    "newsletterPostCommand",
    "publishNewsletterWeb",
    "previewNewsletterPost",
    "reviewNewsletterPost",
    "sendNewsletterEmail",
    "sendNewsletterTest",
    "listNewsletterEmailRuns",
    "getNewsletterEmailRun",
    "listNewsletterRunRecipients",
    "cancelNewsletterEmailRun",
    "newsletterAi",
    "listNewsletterSubscribers",
    "getNewsletterSubscriber",
    "updateNewsletterSubscriber",
    "unsubscribeNewsletterSubscriber",
    "deleteNewsletterSubscriber",
    "listNewsletterTags",
    "createNewsletterTag",
    "deleteNewsletterTag",
    "uploadNewsletterAsset",
    "getNewsletterAsset",
    "previewNewsletterImport",
    "startNewsletterImport",
    "importNewsletterAudience",
    "getNewsletterImport",
    "exportNewsletterSubscribers",
    "newsletterReports",
  ]);
  if (!allowed.has(method)) throw new Error("Unknown newsletter operation.");
  const result = await mailerCall(async (m) => {
    // Call it as a method on `m`. With the service binding, `m` is an RPC stub: every property on it
    // (including a function's `.call`) is treated as a remote method name, so `m[method].call(...)`
    // would ask the mailer for a method named "call".
    const api = m as unknown as Record<
      string,
      (slug: string, ...args: unknown[]) => ReturnType<NewsletterApi[K]>
    >;
    return await api[method]!(slug, ...args);
  });
  const mutations: ReadonlySet<keyof NewsletterApi> = new Set([
    "createPublication",
    "updatePublication",
    "archivePublication",
    "createNewsletterPost",
    "updateNewsletterPost",
    "newsletterPostCommand",
    "publishNewsletterWeb",
    "sendNewsletterEmail",
    "cancelNewsletterEmailRun",
    "updateNewsletterSubscriber",
    "unsubscribeNewsletterSubscriber",
    "deleteNewsletterSubscriber",
    "createNewsletterTag",
    "deleteNewsletterTag",
    "startNewsletterImport",
    "importNewsletterAudience",
  ]);
  if (result.ok && mutations.has(method)) {
    revalidatePath(`/${slug}/newsletters`, "layout");
    revalidatePath("/all/newsletters", "layout");
  }
  return result as Result<Awaited<ReturnType<NewsletterApi[K]>>>;
}

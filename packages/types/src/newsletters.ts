import { z } from "zod";
import type { ListResponse } from "./email";

/** Cloudflare's Email Service FAQ. The dashboard links to it once, on the send page. */
export const NEWSLETTER_POLICY_URL =
  "https://developers.cloudflare.com/email-service/reference/faq/";

/** Why a publication cannot send email right now. Only technical reasons. */
export type NewsletterEmailBlocker =
  | "sender_missing"
  | "sender_unverified"
  | "secrets_missing"
  | "public_host_missing"
  | "inactive";

export interface NewsletterCapabilities {
  /** True when this publication can send email now. */
  email: boolean;
  /** Why `email` is false, else null. */
  emailBlocker: NewsletterEmailBlocker | null;
  webPublication: boolean;
  subscriptionConfirmation: boolean;
  /** True when the mailer has the Workers AI binding. */
  ai: boolean;
  policyUrl: string;
}

export const NewsletterUrl = z
  .string()
  .max(2048)
  .refine((v) => {
    try {
      return ["http:", "https:", "mailto:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "Use an HTTP, HTTPS, or mailto URL.");
const Inline = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      text: z.string().max(100_000),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      href: NewsletterUrl.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("personalization"),
      field: z.enum(["firstName", "lastName"]),
      fallback: z.string().max(200),
    })
    .strict(),
]);
const content = z.array(Inline).max(2000);
const id = z.string().min(1).max(100);
export const NewsletterBlock = z.discriminatedUnion("type", [
  z
    .object({
      id,
      type: z.enum(["paragraph", "heading2", "heading3", "quote"]),
      content,
    })
    .strict(),
  z
    .object({
      id,
      type: z.enum(["bulletList", "orderedList"]),
      items: z.array(content).min(1).max(200),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("image"),
      assetId: id,
      alt: z.string().max(500),
      decorative: z.boolean(),
      caption: z.string().max(500).optional(),
      href: NewsletterUrl.optional(),
      /** Display width in pixels. Absent means full width. */
      width: z.number().int().min(80).max(1200).optional(),
    })
    .strict(),
  z.object({ id, type: z.literal("divider") }).strict(),
  // An unfinished button (empty label or link) still saves; the renderer skips it and review warns.
  z
    .object({
      id,
      type: z.literal("button"),
      label: z.string().max(100),
      href: z.union([z.literal(""), NewsletterUrl]),
    })
    .strict(),
]);
export const NewsletterDocument = z
  .object({
    schemaVersion: z.literal(1),
    blocks: z.array(NewsletterBlock).max(200),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(doc)).length > 256 * 1024)
      ctx.addIssue({
        code: "custom",
        message: "The document exceeds 256 KiB.",
      });
    if (new Set(doc.blocks.map((b) => b.id)).size !== doc.blocks.length)
      ctx.addIssue({ code: "custom", message: "Block IDs must be unique." });
  });
export type NewsletterDocument = z.infer<typeof NewsletterDocument>;
export type NewsletterBlock = z.infer<typeof NewsletterBlock>;
export type NewsletterInline = z.infer<typeof Inline>;

export const NewsletterTheme = z
  .object({
    layout: z.enum(["letter", "digest", "announcement"]).default("letter"),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#c2410c"),
    font: z.enum(["sans", "serif"]).default("sans"),
  })
  .strict();
export type NewsletterTheme = z.infer<typeof NewsletterTheme>;
export const NewsletterSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
export const NewsletterTimezone = z
  .string()
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Select a valid IANA timezone.");
export const CreatePublicationInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: NewsletterSlug,
    description: z.string().max(300).default(""),
    timezone: NewsletterTimezone.default("UTC"),
    theme: NewsletterTheme.default({}),
  })
  .strict();
export type CreatePublicationInput = z.input<typeof CreatePublicationInput>;
export const UpdatePublicationInput = CreatePublicationInput.partial()
  .extend({
    expectedRevision: z.number().int().positive(),
    siteEnabled: z.boolean().optional(),
    formEnabled: z.boolean().optional(),
    fromAddress: z.string().email().nullable().optional(),
    fromName: z.string().max(100).optional(),
    replyTo: z.string().email().nullable().optional(),
    postalAddress: z.string().max(500).optional(),
    logoAssetId: z.string().nullable().optional(),
    aiInstructions: z.string().max(2000).optional(),
  })
  .strict();
export type UpdatePublicationInput = z.input<typeof UpdatePublicationInput>;
export interface PublicationRecord {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string;
  timezone: string;
  status: "draft" | "active" | "archived";
  theme: NewsletterTheme;
  logoAssetId: string | null;
  siteEnabled: boolean;
  formEnabled: boolean;
  fromAddress: string | null;
  fromName: string;
  replyTo: string | null;
  postalAddress: string;
  /** Voice and style notes the AI reads before writing. */
  aiInstructions: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publicUrl: string;
  subscriberCount: number;
  postCount: number;
}
export const NewsletterPostMetadata = z.object({
  title: z.string().max(100),
  subtitle: z.string().max(200),
  subject: z.string().max(200),
  subjectOverridden: z.boolean(),
  previewText: z.string().max(200),
  authorLabel: z.string().max(100),
  slug: NewsletterSlug,
});
export const CreateNewsletterPostInput = z
  .object({
    title: z.string().max(100).default(""),
    document: NewsletterDocument.optional(),
  })
  .strict();
export type CreateNewsletterPostInput = z.input<
  typeof CreateNewsletterPostInput
>;
export const UpdateNewsletterPostInput = NewsletterPostMetadata.partial()
  .extend({
    expectedRevision: z.number().int().positive(),
    document: NewsletterDocument.optional(),
  })
  .strict();
export type UpdateNewsletterPostInput = z.input<
  typeof UpdateNewsletterPostInput
>;
export interface NewsletterPostRecord extends z.infer<
  typeof NewsletterPostMetadata
> {
  id: string;
  projectId: string;
  publicationId: string;
  revision: number;
  draftRevisionId: string;
  publicRevisionId: string | null;
  webStatus: "draft" | "scheduled" | "published" | "unpublished";
  webScheduledAt: string | null;
  scheduleTimezone: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  document: NewsletterDocument;
  publicUrl: string;
  /** The latest email run for this post, or null when it was never emailed. */
  email: NewsletterEmailSummary | null;
}
export const NewsletterFilter = z
  .object({
    status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(),
    q: z.string().max(200).optional(),
    tags: z.array(z.string()).max(20).optional(),
    sources: z.array(z.string().max(200)).max(20).optional(),
    since: z.string().datetime().optional(),
    until: z.string().datetime().optional(),
    audienceId: z.string().optional(),
  })
  .strict();
export type NewsletterFilter = z.infer<typeof NewsletterFilter>;
export interface NewsletterPageQuery {
  limit?: number | string;
  cursor?: string;
  state?: string;
  filter?: NewsletterFilter;
}
export interface NewsletterSubscriptionRecord {
  id: string;
  publicationId: string;
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: "pending" | "subscribed" | "unsubscribed";
  source: string;
  consentSource: string;
  consentAt: string | null;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  revision: number;
  tags: string[];
  createdAt: string;
  blocked: boolean;
  events?: Array<{
    id: string;
    type: string;
    occurredAt: string;
    actorKind: string;
    data: Record<string, unknown>;
  }>;
}
export interface NewsletterTag {
  id: string;
  name: string;
}
export interface NewsletterPreview {
  html: string;
  text: string;
  subject: string;
}
export interface NewsletterReviewCheck {
  id: string;
  label: string;
  ok: boolean;
  /** Only "error" checks block, and only the channel they belong to. */
  level: "error" | "warning";
  channel: "web" | "email" | "both";
  message?: string;
  fix?: "editor" | "settings" | "website" | "subscribers";
}
export interface NewsletterReview {
  post: NewsletterPostRecord;
  capabilities: NewsletterCapabilities;
  eligible: number;
  excluded: { pending: number; unsubscribed: number; suppressed: number };
  checks: NewsletterReviewCheck[];
  sender: { fromAddress: string | null; fromName: string };
  lastRun: NewsletterEmailRun | null;
}
export interface NewsletterReports {
  active: number;
  pending: number;
  unsubscribed: number;
  published: number;
  newSubscriptions: number;
  unsubscribeCount: number;
  sources: Array<{ source: string; count: number }>;
  days: Array<{ date: string; subscribed: number; unsubscribed: number }>;
}

export const NewsletterSendInput = z
  .object({
    expectedRevision: z.number().int().positive(),
    /** The draft revision the user reviewed. */
    revisionId: z.string().min(1).max(100),
    /** Tags, sources and audience narrow the recipients. Status is ignored: only subscribed readers get email. */
    filter: NewsletterFilter.default({}),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    timezone: NewsletterTimezone.optional(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
export type NewsletterSendInput = z.input<typeof NewsletterSendInput>;

export type NewsletterRunStatus = "scheduled" | "sending" | "sent" | "canceled";
export interface NewsletterEmailRun {
  id: string;
  publicationId: string;
  postId: string;
  revisionId: string;
  subject: string;
  status: NewsletterRunStatus;
  scheduledAt: string | null;
  scheduleTimezone: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Recipients fixed when the run was created. */
  total: number;
  /** Recipients handed to the send pipeline or finished some other way. */
  processed: number;
  delivered: number;
  bounced: number;
  /** Rejected or failed emails, plus recipients that could not be queued. */
  failed: number;
  /** Unsubscribed or suppressed between creation and send. */
  skipped: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  /** Set while a run waits for the project's own daily limit to reset. */
  waiting: "daily_limit" | null;
}
export type NewsletterEmailSummary = Pick<
  NewsletterEmailRun,
  | "id"
  | "status"
  | "scheduledAt"
  | "completedAt"
  | "total"
  | "delivered"
  | "opened"
  | "clicked"
>;
export interface NewsletterRunRecipient {
  id: string;
  email: string;
  emailId: string | null;
  status:
    | "pending"
    | "queued"
    | "sent"
    | "delivered"
    | "bounced"
    | "failed"
    | "skipped"
    | "canceled";
  openedAt: string | null;
  clickedAt: string | null;
}
export interface NewsletterRunDetail extends NewsletterEmailRun {
  links: Array<{ url: string; clicks: number }>;
}

export const NewsletterAiTone = z.enum([
  "friendly",
  "professional",
  "casual",
  "confident",
  "playful",
]);
export type NewsletterAiTone = z.infer<typeof NewsletterAiTone>;
export const NewsletterAiInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("draft"),
      brief: z.string().trim().min(1).max(6000),
      tone: NewsletterAiTone.default("friendly"),
      length: z.enum(["short", "medium", "long"]).default("medium"),
    })
    .strict(),
  z
    .object({
      action: z.literal("continue"),
      title: z.string().max(100).default(""),
      before: z.string().max(12000),
      instruction: z.string().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("rewrite"),
      text: z.string().min(1).max(8000),
      instruction: z.enum([
        "improve",
        "fix",
        "shorter",
        "longer",
        "tone",
        "translate",
        "custom",
      ]),
      tone: NewsletterAiTone.optional(),
      language: z.string().max(40).optional(),
      custom: z.string().max(500).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("subjects"),
      title: z.string().max(100),
      content: z.string().max(12000),
    })
    .strict(),
  z
    .object({ action: z.literal("alt-text"), assetId: z.string().min(1).max(100) })
    .strict(),
]);
export type NewsletterAiInput = z.input<typeof NewsletterAiInput>;
export interface NewsletterAiResult {
  /** draft, continue, rewrite: Markdown. */
  text?: string;
  /** subjects: up to five. */
  subjects?: Array<{ subject: string; previewText: string }>;
  /** alt-text: one sentence. */
  altText?: string;
}
export interface NewsletterAsset {
  id: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  previewUrl: string;
}
export interface NewsletterImportMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string;
  source?: string;
}
export interface NewsletterImportPreview {
  fileId: string;
  headers: string[];
  rows: number;
  valid: number;
  invalid: number;
  duplicates: number;
  existing: number;
  protected: number;
  previewToken: string;
  sample: Record<string, string>[];
}
export interface NewsletterImportRecord {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "canceled";
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errorCsv?: string;
  lastError?: string;
}
export interface NewsletterConsent {
  source: string;
  at: string;
}
export interface NewsletterPublishInput {
  expectedRevision: number;
  revisionId: string;
  scheduledAt?: string;
  timezone?: string;
  idempotencyKey: string;
}
export interface NewsletterApi {
  newsletterCapabilities(
    slug: string,
    publicationId?: string,
  ): Promise<NewsletterCapabilities>;
  listPublications(
    slug: string,
    query?: NewsletterPageQuery,
  ): Promise<ListResponse<PublicationRecord>>;
  createPublication(
    slug: string,
    input: CreatePublicationInput,
  ): Promise<PublicationRecord>;
  getPublication(slug: string, id: string): Promise<PublicationRecord>;
  updatePublication(
    slug: string,
    id: string,
    input: UpdatePublicationInput,
  ): Promise<PublicationRecord>;
  archivePublication(
    slug: string,
    id: string,
    expectedRevision: number,
  ): Promise<PublicationRecord>;
  listNewsletterPosts(
    slug: string,
    id: string,
    query?: NewsletterPageQuery,
  ): Promise<ListResponse<NewsletterPostRecord>>;
  createNewsletterPost(
    slug: string,
    id: string,
    input: CreateNewsletterPostInput,
  ): Promise<NewsletterPostRecord>;
  getNewsletterPost(
    slug: string,
    id: string,
    postId: string,
  ): Promise<NewsletterPostRecord>;
  updateNewsletterPost(
    slug: string,
    id: string,
    postId: string,
    input: UpdateNewsletterPostInput,
  ): Promise<NewsletterPostRecord>;
  newsletterPostCommand(
    slug: string,
    id: string,
    postId: string,
    command:
      | "duplicate"
      | "archive"
      | "delete"
      | "unpublish-web"
      | "cancel-web-schedule",
    expectedRevision: number,
  ): Promise<NewsletterPostRecord | { deleted: true }>;
  publishNewsletterWeb(
    slug: string,
    id: string,
    postId: string,
    input: NewsletterPublishInput,
  ): Promise<NewsletterPostRecord>;
  previewNewsletterPost(
    slug: string,
    id: string,
    postId: string,
    target: "email" | "web" | "text",
    subscriptionId?: string,
  ): Promise<NewsletterPreview>;
  reviewNewsletterPost(
    slug: string,
    id: string,
    postId: string,
    filter?: NewsletterFilter,
  ): Promise<NewsletterReview>;
  sendNewsletterEmail(
    slug: string,
    id: string,
    postId: string,
    input: NewsletterSendInput,
  ): Promise<NewsletterEmailRun>;
  sendNewsletterTest(
    slug: string,
    id: string,
    postId: string,
    input: { to: string[]; subscriptionId?: string },
  ): Promise<{ sent: number }>;
  listNewsletterEmailRuns(
    slug: string,
    id: string,
    query?: { postId?: string; limit?: number; cursor?: string },
  ): Promise<ListResponse<NewsletterEmailRun>>;
  getNewsletterEmailRun(
    slug: string,
    id: string,
    runId: string,
  ): Promise<NewsletterRunDetail>;
  listNewsletterRunRecipients(
    slug: string,
    id: string,
    runId: string,
    query?: { status?: string; q?: string; limit?: number; cursor?: string },
  ): Promise<ListResponse<NewsletterRunRecipient>>;
  cancelNewsletterEmailRun(
    slug: string,
    id: string,
    runId: string,
  ): Promise<NewsletterEmailRun>;
  newsletterAi(
    slug: string,
    id: string,
    input: NewsletterAiInput,
  ): Promise<NewsletterAiResult>;
  listNewsletterSubscribers(
    slug: string,
    id: string,
    query?: NewsletterPageQuery,
  ): Promise<ListResponse<NewsletterSubscriptionRecord>>;
  getNewsletterSubscriber(
    slug: string,
    id: string,
    subscriptionId: string,
  ): Promise<NewsletterSubscriptionRecord>;
  updateNewsletterSubscriber(
    slug: string,
    id: string,
    subscriptionId: string,
    input: {
      expectedRevision: number;
      firstName?: string | null;
      lastName?: string | null;
      tags?: string[];
    },
  ): Promise<NewsletterSubscriptionRecord>;
  unsubscribeNewsletterSubscriber(
    slug: string,
    id: string,
    subscriptionId: string,
    expectedRevision: number,
  ): Promise<NewsletterSubscriptionRecord>;
  deleteNewsletterSubscriber(
    slug: string,
    id: string,
    subscriptionId: string,
    expectedRevision: number,
  ): Promise<{ deleted: true }>;
  listNewsletterTags(slug: string, id: string): Promise<NewsletterTag[]>;
  createNewsletterTag(
    slug: string,
    id: string,
    name: string,
  ): Promise<NewsletterTag>;
  deleteNewsletterTag(
    slug: string,
    id: string,
    tagId: string,
  ): Promise<{ deleted: true }>;
  uploadNewsletterAsset(
    slug: string,
    id: string,
    input: { base64: string; mimeType: string },
  ): Promise<NewsletterAsset>;
  getNewsletterAsset(
    slug: string,
    id: string,
    assetId: string,
  ): Promise<{ base64: string; mimeType: string }>;
  previewNewsletterImport(
    slug: string,
    id: string,
    input: { csv: string; mapping?: NewsletterImportMapping; fileId?: string },
  ): Promise<NewsletterImportPreview>;
  startNewsletterImport(
    slug: string,
    id: string,
    input: {
      fileId: string;
      mapping: NewsletterImportMapping;
      consent: NewsletterConsent;
      previewToken: string;
      idempotencyKey: string;
    },
  ): Promise<NewsletterImportRecord>;
  importNewsletterAudience(
    slug: string,
    id: string,
    input: {
      audienceId: string;
      consent: NewsletterConsent;
      idempotencyKey: string;
    },
  ): Promise<NewsletterImportRecord>;
  getNewsletterImport(
    slug: string,
    id: string,
    importId: string,
  ): Promise<NewsletterImportRecord>;
  exportNewsletterSubscribers(
    slug: string,
    id: string,
    filter?: NewsletterFilter,
  ): Promise<{ csv: string }>;
  newsletterReports(
    slug: string,
    id: string,
    input?: { since?: string; until?: string },
  ): Promise<NewsletterReports>;
}

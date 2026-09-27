import { z } from "zod";
import { ApiErrorShape } from "./errors";

// "Name <addr@x.com>" or "addr@x.com"
export const DisplayAddress = z.string().trim().min(3).max(400);
export const AddressList = z.union([DisplayAddress, z.array(DisplayAddress).min(1).max(50)]);

export const Attachment = z.object({
  filename: z.string().min(1).max(255),
  content: z.string(), // base64 ALWAYS at the API boundary (HTTP and RPC)
  type: z.string().min(1).max(127).optional(),
  disposition: z.enum(["attachment", "inline"]).default("attachment"),
  contentId: z.string().max(127).optional(), // required when disposition = inline
});
export type Attachment = z.infer<typeof Attachment>;
export type AttachmentInput = z.input<typeof Attachment>;

export const SendEmailInputBase = z.object({
  from: DisplayAddress.optional(), // falls back to project.default_from
  to: AddressList,
  cc: AddressList.optional(),
  bcc: AddressList.optional(),
  replyTo: DisplayAddress.optional(),
  subject: z.string().min(1).max(998).optional(), // required unless a template supplies it
  html: z.string().optional(),
  text: z.string().optional(),
  headers: z.record(z.string().max(100), z.string().max(2048)).optional(),
  tags: z.record(z.string().max(64), z.string().max(256)).optional(),
  attachments: z.array(Attachment).max(20).optional(),
  idempotencyKey: z.string().min(1).max(256).optional(),
  // phase 2
  template: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  // phase 3
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
});

export const SendEmailInput = SendEmailInputBase
  .refine((v) => v.html || v.text || v.template, { message: "one of html, text or template is required" })
  .refine((v) => v.subject || v.template, { message: "subject is required unless template is set", path: ["subject"] });

export type SendEmailInput = z.input<typeof SendEmailInput>;
export type ParsedSendEmailInput = z.output<typeof SendEmailInput>;

export const SendEmailResult = z.object({
  id: z.string(),
  status: z.enum(["queued", "scheduled", "test"]),
  idempotent: z.boolean().optional(),
});
export type SendEmailResult = z.infer<typeof SendEmailResult>;

export const EmailStatus = z.enum([
  "queued", "scheduled", "sending", "sent", "delivered", "deferred",
  "bounced", "complained", "rejected", "failed", "test", "canceled",
]);
export type EmailStatus = z.infer<typeof EmailStatus>;

export const RecipientStatus = z.enum([
  "queued", "sent", "delivered", "deferred", "bounced", "complained", "rejected", "failed", "test", "canceled",
]);
export type RecipientStatus = z.infer<typeof RecipientStatus>;

export const EmailRecipientRecord = z.object({
  address: z.string(),
  kind: z.enum(["to", "cc", "bcc"]),
  status: z.string(),
  provider: z.string().nullable(),
  smtpStatus: z.string().nullable(),
  smtpResponse: z.string().nullable(),
  deliveryMs: z.number().nullable(),
  bounceType: z.string().nullable(),
  lastEventAt: z.string().nullable(),
});
export type EmailRecipientRecord = z.infer<typeof EmailRecipientRecord>;

export const EmailEventRecord = z.object({
  id: z.string(),
  type: z.string(),
  recipient: z.string().nullable(),
  data: z.unknown(),
  createdAt: z.string(),
});
export type EmailEventRecord = z.infer<typeof EmailEventRecord>;

export const EmailRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  mode: z.enum(["live", "test"]),
  source: z.string(),
  from: z.string(),
  fromName: z.string().nullable(),
  replyTo: z.string().nullable(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  subject: z.string(),
  textPreview: z.string().nullable(),
  tags: z.record(z.string()).nullable(),
  template: z.string().nullable(),
  templateVersion: z.number().nullable(),
  status: EmailStatus,
  cloudflareMessageId: z.string().nullable(),
  lastError: z.object({ code: z.string(), message: z.string() }).nullable(),
  attempts: z.number(),
  sizeBytes: z.number(),
  attachmentCount: z.number(),
  trackOpens: z.boolean(),
  trackClicks: z.boolean(),
  openedAt: z.string().nullable(),
  firstClickedAt: z.string().nullable(),
  createdAt: z.string(),
  queuedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  recipients: z.array(EmailRecipientRecord),
  events: z.array(EmailEventRecord),
});
export type EmailRecord = z.infer<typeof EmailRecord>;

export const EmailContent = z.object({
  html: z.string().nullable(),
  text: z.string().nullable(),
  trackedHtml: z.string().nullable().optional(),
  headers: z.record(z.string()),
  attachments: z.array(z.object({ filename: z.string(), type: z.string().nullable(), size: z.number() })),
});
export type EmailContent = z.infer<typeof EmailContent>;

const Limit = z.coerce.number().int().min(1).max(100).default(25);

export const ListEmailsQuery = z.object({
  limit: Limit,
  cursor: z.string().optional(),
  status: EmailStatus.optional(),
  to: z.string().optional(),
  from: z.string().optional(),
  q: z.string().optional(), // subject contains
  tag: z.string().regex(/^[^:]+:.*$/, "tag must be key:value").optional(),
  since: z.string().datetime({ offset: true }).optional(),
  until: z.string().datetime({ offset: true }).optional(),
});
export type ListEmailsQuery = z.input<typeof ListEmailsQuery>;
export type ParsedListEmailsQuery = z.output<typeof ListEmailsQuery>;

export const AdminListEmailsQuery = ListEmailsQuery.extend({ project: z.string().optional() });
export type AdminListEmailsQuery = z.input<typeof AdminListEmailsQuery>;

export const ListEventsQuery = z.object({
  limit: Limit,
  cursor: z.string().optional(),
  type: z.string().optional(),
  emailId: z.string().optional(),
  since: z.string().datetime({ offset: true }).optional(),
});
export type ListEventsQuery = z.input<typeof ListEventsQuery>;

export const EventRecord = EmailEventRecord.extend({ emailId: z.string(), projectId: z.string() });
export type EventRecord = z.infer<typeof EventRecord>;

export interface ListResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export type BatchItemResult = SendEmailResult | { error: ApiErrorShape };
export interface BatchResult {
  data: BatchItemResult[];
}
export interface BatchDryRunResult {
  dryRun: true;
  data: Array<{ ok: true; from: string; to: string[]; cc: string[]; bcc: string[]; subject: string } | { error: ApiErrorShape }>;
}

export const RescheduleInput = z.object({ scheduledAt: z.string().datetime({ offset: true }) });

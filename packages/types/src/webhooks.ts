import { z } from "zod";
import { WebhookEventType } from "./events";

export const WebhookEventsInput = z.array(z.union([WebhookEventType, z.literal("*")])).min(1);

const HttpUrl = z.string().url().refine((u) => /^https?:\/\//.test(u), "url must be http(s)");

export const CreateWebhookInput = z.object({
  url: HttpUrl,
  events: WebhookEventsInput.default(["*"]),
  enabled: z.boolean().default(true),
});
export type CreateWebhookInput = z.input<typeof CreateWebhookInput>;

export const UpdateWebhookInput = z.object({
  url: HttpUrl.optional(),
  events: WebhookEventsInput.optional(),
  enabled: z.boolean().optional(),
});
export type UpdateWebhookInput = z.input<typeof UpdateWebhookInput>;

export interface WebhookRecord {
  id: string;
  projectId: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Only present on create and rotate-secret responses. */
  secret?: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: string | null;
  attempt: number;
  status: "pending" | "success" | "failed";
  responseCode: number | null;
  responseBody: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** The JSON body POSTed to a webhook endpoint. */
export interface WebhookPayload {
  id: string;
  type: string;
  createdAt: string;
  data: {
    emailId: string;
    recipient: string | null;
    from: string;
    subject: string;
    tags: Record<string, string>;
    [key: string]: unknown;
  };
}

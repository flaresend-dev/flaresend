import { z } from "zod";

/** Every timeline event type Flaresend writes to email_events. */
export const EMAIL_EVENT_TYPES = [
  "email.queued", "email.sent", "email.retrying", "email.delivered", "email.deferred",
  "email.bounced", "email.complained", "email.rejected", "email.failed", "email.test",
  "email.canceled", "email.scheduled", "email.opened", "email.clicked",
] as const;
export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number];

/** Event types a webhook can subscribe to. */
export const WEBHOOK_EVENT_TYPES = [
  "email.queued", "email.sent", "email.delivered", "email.deferred", "email.bounced",
  "email.complained", "email.rejected", "email.failed",
  "email.opened", "email.clicked", "email.canceled",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
export const WebhookEventType = z.enum(WEBHOOK_EVENT_TYPES);

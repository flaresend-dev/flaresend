import { z } from "zod";

export type CfEmailEventType =
  | "cf.email.sending.message.delivered" | "cf.email.sending.message.deferred"
  | "cf.email.sending.message.bounced"   | "cf.email.sending.message.failed"
  | "cf.email.sending.message.rejected"  | "cf.email.sending.message.complained";

export type CfDeliveryStatus = "delivered" | "deferred" | "bounced" | "failed" | "rejected" | "complained";

export interface CfEmailEvent {
  type: CfEmailEventType;
  source: { type: "email.sending"; zoneId: string; domain: string };
  payload: {
    eventId: string;                 // dedupe key
    messageId: string;               // == the messageId returned by env.EMAIL.send()
    sender: string;
    recipient: string;               // ONE recipient per event
    subject?: string;                // absent on complained
    terminal: boolean;
    delivery: {
      status: CfDeliveryStatus;
      provider?: string; deliveryTimeMs?: number;
      smtpStatusCode?: string; smtpEnhancedStatusCode?: string; smtpResponse?: string;
    };
    bounce?: { type: "hard" | "soft"; classification: string; reason: string };
    failure?: { reason: string };
    rejection?: { reason: string; party: string; detail: string };
    complaint?: { type: string };
  };
  metadata: { accountId: string; eventSubscriptionId: string; eventSchemaVersion: number; eventTimestamp: string };
}

/** Loose runtime check used by the events consumer and the dev endpoint. Unknown extra fields are kept. */
export const CfEmailEventSchema = z.object({
  type: z.string().startsWith("cf.email.sending.message."),
  source: z.object({ type: z.string(), zoneId: z.string().optional(), domain: z.string().optional() }).passthrough(),
  payload: z.object({
    eventId: z.string(),
    messageId: z.string(),
    sender: z.string().optional(),
    recipient: z.string(),
    subject: z.string().optional(),
    terminal: z.boolean().optional(),
    delivery: z.object({
      status: z.enum(["delivered", "deferred", "bounced", "failed", "rejected", "complained"]),
      provider: z.string().optional(),
      deliveryTimeMs: z.number().optional(),
      smtpStatusCode: z.union([z.string(), z.number()]).optional(),
      smtpEnhancedStatusCode: z.string().optional(),
      smtpResponse: z.string().optional(),
    }).passthrough(),
    bounce: z.object({ type: z.string(), classification: z.string().optional(), reason: z.string().optional() }).passthrough().optional(),
    failure: z.object({ reason: z.string().optional() }).passthrough().optional(),
    rejection: z.object({ reason: z.string().optional(), party: z.string().optional(), detail: z.string().optional() }).passthrough().optional(),
    complaint: z.object({ type: z.string().optional() }).passthrough().optional(),
  }).passthrough(),
  metadata: z.object({
    accountId: z.string().optional(),
    eventSubscriptionId: z.string().optional(),
    eventSchemaVersion: z.number().optional(),
    eventTimestamp: z.string(),
  }).passthrough(),
}).passthrough();

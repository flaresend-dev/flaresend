import { z } from "zod";

export const ContactInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().max(200).nullable().optional(),
  lastName: z.string().max(200).nullable().optional(),
  unsubscribed: z.boolean().optional(),
  data: z.record(z.unknown()).nullable().optional(),
});
export type ContactInput = z.input<typeof ContactInput>;

export const UpdateContactInput = ContactInput.omit({ email: true }).partial();
export type UpdateContactInput = z.input<typeof UpdateContactInput>;
export const ImportContactsInput = z.array(ContactInput).min(1).max(5000);

export interface ContactRecord {
  id: string;
  projectId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  unsubscribed: boolean;
  data: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const CreateAudienceInput = z.object({ name: z.string().min(1).max(200) });
export const AudienceContactsInput = z.object({ contactIds: z.array(z.string()).min(1).max(5000) });

export interface AudienceRecord {
  id: string;
  projectId: string;
  name: string;
  contactCount: number;
  createdAt: string;
}

export const CreateBroadcastInput = z.object({
  audienceId: z.string(),
  from: z.string().min(3),
  subject: z.string().min(1).max(998),
  html: z.string().min(1),
  text: z.string().optional(),
});
export type CreateBroadcastInput = z.input<typeof CreateBroadcastInput>;
export const UpdateBroadcastInput = CreateBroadcastInput.partial();
export type UpdateBroadcastInput = z.input<typeof UpdateBroadcastInput>;
export const SendBroadcastInput = z.object({ scheduledAt: z.string().datetime({ offset: true }).optional() });

export type BroadcastStatus = "draft" | "scheduled" | "sending" | "sent" | "canceled";

export interface BroadcastRecord {
  id: string;
  projectId: string;
  audienceId: string;
  from: string;
  fromName: string | null;
  subject: string;
  html: string;
  text: string | null;
  status: BroadcastStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  total: number;
  sent: number;
  createdAt: string;
  updatedAt: string;
  counts?: Record<string, number>;
}

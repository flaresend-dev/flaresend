import type { AudienceRecord, BroadcastRecord, BroadcastStatus, ContactRecord } from "@flaresend/types";
import { bool, parseJson } from "./client";

export interface ContactRow {
  id: string;
  project_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unsubscribed: number;
  data: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudienceRow {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  contact_count?: number;
}

export interface BroadcastRow {
  id: string;
  project_id: string;
  audience_id: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  html: string;
  text: string | null;
  status: BroadcastStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cursor: string | null;
  total: number;
  sent: number;
  created_at: string;
  updated_at: string;
}

export function toContactRecord(c: ContactRow): ContactRecord {
  return {
    id: c.id,
    projectId: c.project_id,
    email: c.email,
    firstName: c.first_name,
    lastName: c.last_name,
    unsubscribed: bool(c.unsubscribed),
    data: parseJson<Record<string, unknown> | null>(c.data, null),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

export function toAudienceRecord(a: AudienceRow): AudienceRecord {
  return { id: a.id, projectId: a.project_id, name: a.name, contactCount: a.contact_count ?? 0, createdAt: a.created_at };
}

export function toBroadcastRecord(b: BroadcastRow, counts?: Record<string, number>): BroadcastRecord {
  return {
    id: b.id,
    projectId: b.project_id,
    audienceId: b.audience_id,
    from: b.from_address,
    fromName: b.from_name,
    subject: b.subject,
    html: b.html,
    text: b.text,
    status: b.status,
    scheduledAt: b.scheduled_at,
    startedAt: b.started_at,
    completedAt: b.completed_at,
    total: b.total,
    sent: b.sent,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    ...(counts ? { counts } : {}),
  };
}

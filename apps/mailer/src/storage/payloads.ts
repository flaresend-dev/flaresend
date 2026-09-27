import type { Attachment } from "@flaresend/types";

/** A recipient as the send_email binding accepts it: a bare address or { email, name }. */
export type PayloadAddress = string | { email: string; name: string };

/** One JSON object per email in R2 at payloads/{emailId}.json. Attachments stay base64. */
export interface StoredPayload {
  from: string;
  fromName: string | null;
  replyTo: PayloadAddress | null;
  to: PayloadAddress[];
  cc: PayloadAddress[];
  bcc: PayloadAddress[];
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  attachments: Attachment[];
}

export const payloadKey = (emailId: string) => `payloads/${emailId}.json`;
export const trackedHtmlKey = (emailId: string) => `payloads/${emailId}.tracked.html`;

export function serialisePayload(p: StoredPayload): string {
  return JSON.stringify(p);
}

export async function putPayload(env: Env, emailId: string, projectId: string, json: string): Promise<void> {
  await env.PAYLOADS.put(payloadKey(emailId), json, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { projectId },
  });
}

export async function getPayload(env: Env, emailId: string): Promise<StoredPayload | null> {
  const obj = await env.PAYLOADS.get(payloadKey(emailId));
  if (!obj) return null;
  return (await obj.json()) as StoredPayload;
}

export async function deletePayload(env: Env, emailId: string): Promise<void> {
  await env.PAYLOADS.delete([payloadKey(emailId), trackedHtmlKey(emailId)]);
}

export async function putTrackedHtml(env: Env, emailId: string, html: string): Promise<void> {
  await env.PAYLOADS.put(trackedHtmlKey(emailId), html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
}

export async function getTrackedHtml(env: Env, emailId: string): Promise<string | null> {
  const obj = await env.PAYLOADS.get(trackedHtmlKey(emailId));
  return obj ? obj.text() : null;
}

export function toPayloadAddress(r: { address: string; name: string | null }): PayloadAddress {
  return r.name ? { email: r.address, name: r.name } : r.address;
}

export function base64ByteLength(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

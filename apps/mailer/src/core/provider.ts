// The ONLY module that touches env.EMAIL. Tests replace `emailProvider.send` with vi.spyOn.
import type { StoredPayload } from "../storage/payloads";

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", txt: "text/plain", csv: "text/csv", html: "text/html",
  json: "application/json", zip: "application/zip", ics: "text/calendar",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function buildMessage(p: StoredPayload, emailId: string, htmlOverride?: string | null): EmailMessageBuilder {
  const msg: Record<string, unknown> = {
    from: p.fromName ? { email: p.from, name: p.fromName } : p.from,
    subject: p.subject,
    headers: { ...p.headers, "X-Flaresend-Id": emailId },
  };
  if (p.to.length) msg.to = p.to;
  if (p.cc.length) msg.cc = p.cc;
  if (p.bcc.length) msg.bcc = p.bcc;
  if (p.replyTo) msg.replyTo = p.replyTo;
  const html = htmlOverride ?? p.html;
  if (html) msg.html = html;
  if (p.text) msg.text = p.text;
  if (p.attachments.length) {
    msg.attachments = p.attachments.map((a) => ({
      filename: a.filename,
      type: a.type ?? guessMimeType(a.filename),
      disposition: a.disposition,
      ...(a.disposition === "inline" ? { contentId: a.contentId } : {}),
      content: base64ToArrayBuffer(a.content), // binding wants raw bytes, NOT base64
    }));
  }
  return msg as unknown as EmailMessageBuilder;
}

/** Throws the binding's error unchanged; callers read `err.code` (E_*). */
async function sendImpl(
  env: Env,
  payload: StoredPayload,
  emailId: string,
  htmlOverride?: string | null,
): Promise<{ messageId: string }> {
  const r = await env.EMAIL.send(buildMessage(payload, emailId, htmlOverride));
  return { messageId: r.messageId };
}

export const emailProvider = { send: sendImpl };

export function sendViaCloudflare(env: Env, payload: StoredPayload, emailId: string, htmlOverride?: string | null): Promise<{ messageId: string }> {
  return emailProvider.send(env, payload, emailId, htmlOverride);
}

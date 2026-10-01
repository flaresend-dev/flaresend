// The ONE send entry point. HTTP routes, RPC, batch, resend, scheduled and broadcasts all call sendEmail().
import { parseDisplayAddress, SendEmailInput, type ParsedSendEmailInput, type SendEmailResult } from "@flaresend/types";
import type { SendQueueMessage, WaitUntil } from "../env";
import { batch } from "../db/client";
import { insertEmailStmt, type NewEmailRow } from "../db/emails";
import { insertEventStmt, type EventRow } from "../db/events";
import type { ProjectRow } from "../db/projects";
import { insertRecipientStmt } from "../db/recipients";
import { findSuppressed } from "../db/suppressions";
import { ApiError } from "../http/errors";
import { enqueueSend, MAX_QUEUE_DELAY_SECONDS, type SendJob } from "../queue/producer";
import { putPayload, serialisePayload, toPayloadAddress, type StoredPayload } from "../storage/payloads";
import { enqueueWebhooksSafe } from "../webhooks/deliver";
import { bodyHash, checkIdempotency } from "./idempotency";
import { newId, nowIso } from "./ids";
import { checkDailyLimit, checkRateLimit } from "./ratelimit";
import { renderForProject } from "./render";
import {
  checkPayloadSize, normaliseRecipients, resolveSender, textPreview, validateAttachments, validateHeaders, validateSchedule,
  type NormalisedRecipients, type Sender,
} from "./validate";

export type SendSource = "http" | "rpc" | "batch" | "broadcast" | "scheduled";

export interface SendContext {
  project: ProjectRow;
  mode: "live" | "test";
  source: SendSource;
  apiKeyId: string | null;
  /** Background work (webhook fan-out). Falls back to awaiting inline. */
  waitUntil?: WaitUntil;
}

export interface SendOptions {
  /** Internal only. Transport schemas never expose these fields. */
  purpose?: "transactional" | "subscription_confirmation" | "newsletter";
  newsletterTokenHash?: string;
  newsletterRunId?: string;
  newsletterRecipientId?: string;
  /** Overrides input.idempotencyKey (HTTP Idempotency-Key header). */
  idempotencyKey?: string;
  /** Tags merged over the input tags (e.g. resent_from, broadcast_id). */
  extraTags?: Record<string, string>;
  /** Extra headers merged over the input headers (e.g. List-Unsubscribe for broadcasts). */
  extraHeaders?: Record<string, string>;
  /** Skip the suppression check (the caller already filtered, e.g. broadcasts). */
  skipSuppressionCheck?: boolean;
  /** Return the queue job instead of sending it, so batch callers can use sendBatch. */
  deferQueue?: boolean;
}

/** Everything steps 1–7 produce. Also the dry-run output. */
export interface PreparedEmail {
  input: ParsedSendEmailInput;
  sender: Sender;
  recipients: NormalisedRecipients;
  replyTo: Sender | null;
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  tags: Record<string, string> | null;
  templateName: string | null;
  templateVersion: number | null;
  scheduledAt: Date | null;
  idempotencyKey: string | null;
  bodyHash: string;
  payloadJson: string;
  sizeBytes: number;
  trackOpens: boolean;
  trackClicks: boolean;
}

export interface SendOutcome {
  result: SendEmailResult;
  /** Present when opts.deferQueue was set and the email needs to be queued now. */
  job?: SendJob;
}

/** Every check before a send is stored: parse, sender, recipients, suppressions, headers, template, size. No writes. */
export async function prepareEmail(env: Env, ctx: SendContext, raw: unknown, opts: SendOptions = {}): Promise<PreparedEmail> {
  // 1. Parse.
  const parsedResult = SendEmailInput.safeParse(raw);
  if (!parsedResult.success) throw ApiError.fromZod(parsedResult.error);
  const input = parsedResult.data;
  const idempotencyKey = opts.idempotencyKey ?? input.idempotencyKey ?? null;

  // 2. Sender.
  const sender = resolveSender(input.from, ctx.project);
  let replyTo: Sender | null = null;
  if (input.replyTo) {
    try {
      replyTo = parseDisplayAddress(input.replyTo);
    } catch {
      throw ApiError.validation("invalid_body", `replyTo is not a valid address: ${input.replyTo}`, "replyTo");
    }
  }

  // 3. Recipients.
  const recipients = normaliseRecipients(input);

  // 4. Suppressions (skipped for test mode).
  if (ctx.mode === "live" && !opts.skipSuppressionCheck) {
    const suppressed = await findSuppressed(env.DB, recipients.all.map((r) => r.address));
    if (suppressed.length > 0) {
      const s = suppressed[0]!;
      throw ApiError.unprocessable("recipient_suppressed", `${s.address} is on the suppression list (${s.reason})`, s.address);
    }
  }

  // 5. Headers.
  const headers = validateHeaders({ ...(input.headers ?? {}), ...(opts.extraHeaders ?? {}) });

  // 6. Template.
  let subject = input.subject ?? null;
  let html = input.html ?? null;
  let text = input.text ?? null;
  let templateName: string | null = null;
  let templateVersion: number | null = null;
  if (input.template) {
    const r = await renderForProject(env.DB, ctx.project.id, input.template, input.data ?? {});
    subject = input.subject ?? r.subject;
    html = input.html ?? r.html;
    text = input.text ?? r.text;
    templateName = r.templateName;
    templateVersion = r.templateVersion;
  }
  if (!subject) throw ApiError.validation("invalid_body", "subject is required", "subject");
  if (subject.length > 998) throw ApiError.validation("invalid_body", "subject is longer than 998 characters", "subject");
  if (/[\r\n]/.test(subject)) subject = subject.replace(/[\r\n]+/g, " ");

  // 7. Attachments and size.
  const attachments = validateAttachments(input.attachments);
  checkPayloadSize({ html: html ?? undefined, text: text ?? undefined, attachments });

  const scheduledAt = validateSchedule(input.scheduledAt);
  const tags = input.tags || opts.extraTags ? { ...(input.tags ?? {}), ...(opts.extraTags ?? {}) } : null;

  const payload: StoredPayload = {
    from: sender.address,
    fromName: sender.name,
    replyTo: replyTo ? toPayloadAddress(replyTo) : null,
    to: recipients.to.map(toPayloadAddress),
    cc: recipients.cc.map(toPayloadAddress),
    bcc: recipients.bcc.map(toPayloadAddress),
    subject,
    html,
    text,
    headers,
    attachments,
  };
  const payloadJson = serialisePayload(payload);

  return {
    input,
    sender,
    recipients,
    replyTo,
    subject,
    html,
    text,
    headers,
    tags,
    templateName,
    templateVersion,
    scheduledAt,
    idempotencyKey,
    bodyHash: await bodyHash(input as unknown as Record<string, unknown>),
    payloadJson,
    sizeBytes: new TextEncoder().encode(payloadJson).length,
    trackOpens: !!html && (input.trackOpens ?? ctx.project.track_opens === 1),
    trackClicks: !!html && (input.trackClicks ?? ctx.project.track_clicks === 1),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String((err as Error)?.message ?? err));
}

/** Steps 8–14. Returns the job instead of enqueueing when opts.deferQueue is set. */
export async function sendEmailInternal(env: Env, ctx: SendContext, raw: unknown, opts: SendOptions = {}): Promise<SendOutcome> {
  const p = await prepareEmail(env, ctx, raw, opts);
  const project = ctx.project;

  // 8. Idempotency.
  if (p.idempotencyKey) {
    const replay = await checkIdempotency(env.DB, project.id, p.idempotencyKey, p.bodyHash);
    if (replay) return { result: replay };
  }

  // 9. Rate limits (live only).
  if (ctx.mode === "live") {
    await checkRateLimit(env, project);
    await checkDailyLimit(env, project);
  }

  // 10. Payload to R2.
  const id = newId("email");
  const now = nowIso();
  await putPayload(env, id, project.id, p.payloadJson);

  // 11. D1 rows.
  const isTest = ctx.mode === "test";
  const isScheduled = !isTest && p.scheduledAt !== null;
  const delaySeconds = isScheduled ? Math.max(0, (p.scheduledAt!.getTime() - Date.now()) / 1000) : 0;
  const enqueueNow = !isTest && (!isScheduled || delaySeconds <= MAX_QUEUE_DELAY_SECONDS);
  const status = isTest ? "test" : isScheduled ? "scheduled" : "queued";

  const row: NewEmailRow = {
    purpose: opts.purpose ?? "transactional",
    newsletter_token_hash: opts.newsletterTokenHash ?? null,
    newsletter_run_id: opts.newsletterRunId ?? null,
    newsletter_recipient_id: opts.newsletterRecipientId ?? null,
    id,
    project_id: project.id,
    api_key_id: ctx.apiKeyId,
    mode: ctx.mode,
    source: ctx.source,
    from_address: p.sender.address,
    from_name: p.sender.name,
    reply_to: p.replyTo?.address ?? null,
    to_addresses: JSON.stringify(p.recipients.to.map((r) => r.address)),
    cc_addresses: JSON.stringify(p.recipients.cc.map((r) => r.address)),
    bcc_addresses: JSON.stringify(p.recipients.bcc.map((r) => r.address)),
    subject: p.subject,
    text_preview: textPreview(p.text ?? undefined, p.html ?? undefined),
    has_html: p.html ? 1 : 0,
    has_text: p.text ? 1 : 0,
    attachment_count: p.input.attachments?.length ?? 0,
    size_bytes: p.sizeBytes,
    tags: p.tags ? JSON.stringify(p.tags) : null,
    template_name: p.templateName,
    template_version: p.templateVersion,
    idempotency_key: p.idempotencyKey,
    body_hash: p.bodyHash,
    status,
    cloudflare_message_id: null,
    last_error_code: null,
    last_error_message: null,
    attempts: 0,
    created_at: now,
    queued_at: status === "queued" ? now : null,
    sent_at: null,
    delivered_at: null,
    failed_at: null,
    scheduled_at: p.scheduledAt?.toISOString() ?? null,
    enqueued_at: isScheduled && enqueueNow ? now : null,
    track_opens: p.trackOpens ? 1 : 0,
    track_clicks: p.trackClicks ? 1 : 0,
  };

  const event: EventRow = {
    id: newId("evt"),
    email_id: id,
    project_id: project.id,
    recipient: null,
    type: isTest ? "email.test" : isScheduled ? "email.scheduled" : "email.queued",
    cloudflare_event_id: null,
    data: isScheduled ? JSON.stringify({ scheduledAt: row.scheduled_at }) : null,
    created_at: now,
  };

  try {
    await batch(env.DB, [
      insertEmailStmt(env.DB, row),
      ...p.recipients.all.map((r) =>
        insertRecipientStmt(env.DB, {
          id: newId("rcpt"), email_id: id, address: r.address, kind: r.kind, status: isTest ? "test" : "queued",
          provider: null, smtp_status: null, smtp_response: null, delivery_ms: null, bounce_type: null, last_event_at: null,
        }),
      ),
      insertEventStmt(env.DB, event),
    ]);
  } catch (err) {
    // A concurrent request with the same Idempotency-Key won the race.
    if (p.idempotencyKey && isUniqueViolation(err)) {
      await env.PAYLOADS.delete(`payloads/${id}.json`).catch(() => {});
      const replay = await checkIdempotency(env.DB, project.id, p.idempotencyKey, p.bodyHash);
      if (replay) return { result: replay };
    }
    throw err;
  }

  // 12. Queue.
  let job: SendJob | undefined;
  if (enqueueNow) {
    const body: SendQueueMessage = { kind: "send", emailId: id, projectId: project.id, attempt: 0 };
    job = { body, ...(isScheduled ? { delaySeconds: Math.ceil(delaySeconds) } : {}) };
    if (!opts.deferQueue) {
      try {
        await enqueueSend(env, job);
      } catch (err) {
        await markQueueError(env, id, project.id, err);
        throw ApiError.internal("could not queue the email; it was not sent");
      }
      job = undefined;
    }
  }

  // 13. Webhooks for email.queued.
  if (event.type === "email.queued") {
    const work = enqueueWebhooksSafe(env, project.id, [event], { id, from_address: row.from_address, subject: row.subject, tags: row.tags });
    if (ctx.waitUntil) ctx.waitUntil(work);
    else await work;
  }

  // 14.
  return { result: { id, status: status === "queued" ? "queued" : status }, job };
}

export async function markQueueError(env: Env, emailId: string, projectId: string, err: unknown): Promise<void> {
  const now = nowIso();
  console.error("queue send failed", { emailId, err: String(err) });
  await env.DB.batch([
    env.DB.prepare("UPDATE emails SET status = 'failed', last_error_code = 'queue_error', last_error_message = ?, failed_at = ? WHERE id = ?")
      .bind(String((err as Error)?.message ?? err).slice(0, 500), now, emailId),
    env.DB.prepare("UPDATE email_recipients SET status = 'failed' WHERE email_id = ?").bind(emailId),
    insertEventStmt(env.DB, {
      id: newId("evt"), email_id: emailId, project_id: projectId, recipient: null,
      type: "email.failed", cloudflare_event_id: null, data: JSON.stringify({ code: "queue_error" }), created_at: now,
    }),
  ]);
}

export async function sendEmail(env: Env, ctx: SendContext, raw: unknown, opts: SendOptions = {}): Promise<SendEmailResult> {
  return (await sendEmailInternal(env, ctx, raw, { ...opts, deferQueue: false })).result;
}

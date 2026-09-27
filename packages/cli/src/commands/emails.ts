import type { Command } from "commander";
import type { EmailContent, EmailRecord, ListResponse, SendEmailResult } from "@flaresend/types";
import { parseIntOption } from "../bodies";
import { ctx, enc } from "../context";
import { keyValues, list, table, truncate } from "../format";

interface ListOpts {
  project?: string;
  status?: string;
  to?: string;
  from?: string;
  q?: string;
  tag?: string;
  since?: string;
  until?: string;
  limit?: string;
  cursor?: string;
}

function eventSummary(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  const delivery = d.delivery as Record<string, unknown> | undefined;
  const smtp = delivery?.smtpResponse ?? d.smtpResponse;
  if (typeof smtp === "string") parts.push(smtp);
  for (const k of ["bounce", "failure", "rejection", "complaint"]) {
    const v = d[k] as Record<string, unknown> | undefined;
    if (v && typeof v === "object") {
      const r = v.reason ?? v.type;
      if (typeof r === "string") parts.push(`${k}: ${r}`);
    }
  }
  if (typeof d.message === "string") parts.push(d.message);
  if (typeof d.code === "string" && !parts.length) parts.push(d.code);
  return parts.join("; ");
}

export function emailDetails(e: EmailRecord): string {
  const header = keyValues([
    ["ID", e.id],
    ["Status", e.status],
    ["Mode", e.mode],
    ["Project", e.projectId],
    ["From", e.fromName ? `${e.fromName} <${e.from}>` : e.from],
    ["To", list(e.to)],
    ["Cc", list(e.cc)],
    ["Bcc", list(e.bcc)],
    ["Reply-To", e.replyTo],
    ["Subject", e.subject],
    ["Template", e.template ? `${e.template}${e.templateVersion != null ? ` v${e.templateVersion}` : ""}` : null],
    ["Tags", e.tags ? Object.entries(e.tags).map(([k, v]) => `${k}=${v}`).join(", ") : null],
    ["Source", e.source],
    ["Cloudflare ID", e.cloudflareMessageId],
    ["Attempts", e.attempts],
    ["Last error", e.lastError ? `${e.lastError.code}: ${e.lastError.message}` : null],
    ["Created", e.createdAt],
    ["Scheduled", e.scheduledAt],
    ["Sent", e.sentAt],
    ["Delivered", e.deliveredAt],
    ["Failed", e.failedAt],
  ]);

  const recipients = e.recipients?.length
    ? table(
        ["ADDRESS", "KIND", "STATUS", "PROVIDER", "SMTP", "DELIVERY MS", "BOUNCE", "LAST EVENT"],
        e.recipients.map((r) => [r.address, r.kind, r.status, r.provider, r.smtpStatus, r.deliveryMs, r.bounceType, r.lastEventAt]),
        { alignRight: [5] },
      )
    : "No recipient rows.";

  const events = e.events?.length
    ? table(
        ["TIME", "TYPE", "RECIPIENT", "DETAIL"],
        [...e.events]
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((ev) => [ev.createdAt, ev.type, ev.recipient, truncate(eventSummary(ev.data), 80)]),
      )
    : "No events yet.";

  return `${header}\n\nRecipients\n${recipients}\n\nEvents\n${events}`;
}

export function registerEmails(program: Command): void {
  const emails = program.command("emails").description("inspect sent emails (admin key)");

  emails
    .command("list")
    .description("list emails, newest first")
    .option("--project <slug>", "only this project")
    .option("--status <status>", "queued, sent, delivered, bounced, failed, ...")
    .option("--to <address>", "recipient address")
    .option("--from <address>", "sender address")
    .option("--q <text>", "subject contains")
    .option("--tag <key:value>", "tag filter")
    .option("--since <date>", "created at or after (ISO 8601)")
    .option("--until <date>", "created before (ISO 8601)")
    .option("--limit <n>", "1-100, default 25")
    .option("--cursor <cursor>", "nextCursor from a previous page")
    .action(async (opts: ListOpts, cmd: Command) => {
      const c = ctx(cmd);
      const limit = opts.limit !== undefined ? parseIntOption("--limit", opts.limit) : undefined;
      const res = await c.admin().get<ListResponse<EmailRecord>>("/v1/admin/emails", {
        project: opts.project,
        status: opts.status,
        to: opts.to,
        from: opts.from,
        q: opts.q,
        tag: opts.tag,
        since: opts.since,
        until: opts.until,
        limit,
        cursor: opts.cursor,
      });
      c.print(res, (r) => {
        if (r.data.length === 0) return "No emails found.";
        const t = table(
          ["ID", "STATUS", "MODE", "TO", "SUBJECT", "CREATED"],
          r.data.map((e) => [e.id, e.status, e.mode, list(e.to), e.subject, e.createdAt]),
          { maxWidths: [undefined, undefined, undefined, 36, 50] },
        );
        return r.nextCursor ? `${t}\n\nMore results: flaresend emails list --cursor ${r.nextCursor}` : t;
      });
    });

  emails
    .command("get <id>")
    .description("show one email with its recipients and events")
    .action(async (id: string, _opts, cmd: Command) => {
      const c = ctx(cmd);
      const e = await c.admin().get<EmailRecord>(`/v1/admin/emails/${enc(id)}`);
      c.print(e, emailDetails);
    });

  emails
    .command("content <id>")
    .description("print the stored body (default: headers, attachments and the text or HTML body)")
    .option("--html", "print only the HTML body")
    .option("--text", "print only the text body")
    .action(async (id: string, opts: { html?: boolean; text?: boolean }, cmd: Command) => {
      const c = ctx(cmd);
      const content = await c.admin().get<EmailContent>(`/v1/admin/emails/${enc(id)}/content`);
      c.print(content, (x) => {
        if (opts.html) return x.html ?? "(no HTML body)";
        if (opts.text) return x.text ?? "(no text body)";
        const parts: string[] = [];
        const headers = Object.entries(x.headers ?? {});
        if (headers.length) parts.push("Headers\n" + keyValues(headers));
        if (x.attachments?.length) {
          parts.push("Attachments\n" + table(["FILENAME", "TYPE", "BYTES"], x.attachments.map((a) => [a.filename, a.type, a.size]), { alignRight: [2] }));
        }
        if (x.text) parts.push("Text body\n" + x.text);
        else if (x.html) parts.push("HTML body\n" + x.html);
        else parts.push("(no body)");
        if (x.text && x.html) parts.push("(HTML body also present; use --html to print it)");
        return parts.join("\n\n");
      });
    });

  emails
    .command("resend <id>")
    .description("send the same stored payload again as a new email")
    .action(async (id: string, _opts, cmd: Command) => {
      const c = ctx(cmd);
      const r = await c.admin().post<SendEmailResult>(`/v1/admin/emails/${enc(id)}/resend`);
      c.print(r, (x) => `Resent ${id} as ${x.id} (status: ${x.status})`);
    });
}

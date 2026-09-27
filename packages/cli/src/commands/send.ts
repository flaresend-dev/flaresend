import { readFileSync } from "node:fs";
import type { Command } from "commander";
import type { SendEmailResult } from "@flaresend/types";
import { buildSendRequest, collect, collectList, type SendOptions } from "../bodies";
import { ctx } from "../context";

export function registerSend(program: Command): void {
  program
    .command("send")
    .description("send an email with a project API key (FLARESEND_API_KEY)")
    .option("--from <address>", 'sender, e.g. "Acme <hello@acme.com>" (default: the project\'s default from)')
    .option("--to <addresses>", "recipient; repeat or comma-separate for more", collectList)
    .option("--cc <addresses>", "cc recipient; repeat or comma-separate", collectList)
    .option("--bcc <addresses>", "bcc recipient; repeat or comma-separate", collectList)
    .option("--reply-to <address>", "Reply-To address")
    .option("--subject <subject>", "subject (optional with --template)")
    .option("--text <text>", "plain text body")
    .option("--html <html>", "HTML body")
    .option("--html-file <path>", "read the HTML body from a file")
    .option("--template <name>", "template name")
    .option("--data <json>", "template data as a JSON object")
    .option("--tag <key=value>", "tag; repeat for more", collect)
    .option("--idempotency-key <key>", "sent as the Idempotency-Key header")
    .option("--scheduled-at <date>", "send later (ISO 8601)")
    .option("--project <slug>", "ignored: the API key already decides the project")
    .action(async (opts: SendOptions, cmd: Command) => {
      const c = ctx(cmd);
      const { body, headers } = buildSendRequest(opts, (p) => readFileSync(p, "utf8"));
      const api = c.project();
      if (opts.project) process.stderr.write("Note: --project is ignored; the API key decides the project.\n");
      const r = await api.post<SendEmailResult>("/v1/emails", body, headers);
      c.print(r, (x) => `${x.idempotent ? "Already sent (idempotent)" : "Accepted"}: ${x.id} (status: ${x.status})`);
    });
}

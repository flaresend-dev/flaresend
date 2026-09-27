import { Option, type Command } from "commander";
import type { EmailRecord } from "@flaresend/types";
import { CliError } from "../api";
import { ctx, enc } from "../context";
import { DEV_EVENT_TYPES, buildDevEventsForEmail, isDevEventType } from "../dev-event";

export function registerDev(program: Command): void {
  const dev = program.command("dev").description("local development helpers (admin key; mailer must not be in production)");

  dev
    .command("event <type> <emailId>")
    .description(`post a fake Cloudflare delivery event for an email. type: ${DEV_EVENT_TYPES.join("|")}`)
    .option("--recipient <address>", "only this recipient (default: every recipient)")
    .option("--message-id <id>", "use this Cloudflare message id instead of the email's")
    .addOption(new Option("--bounce-type <type>", "for bounced events").choices(["hard", "soft"]).default("hard"))
    .action(async (type: string, emailId: string, opts: { recipient?: string; messageId?: string; bounceType: "hard" | "soft" }, cmd: Command) => {
      if (!isDevEventType(type)) throw new CliError(`unknown event type "${type}". Use one of: ${DEV_EVENT_TYPES.join(", ")}`);
      const c = ctx(cmd);
      const api = c.admin();
      const email = await api.get<EmailRecord>(`/v1/admin/emails/${enc(emailId)}`);

      let events;
      try {
        events = buildDevEventsForEmail(email, type, opts);
      } catch (err) {
        throw new CliError(err instanceof Error ? err.message : String(err));
      }

      const results: Array<{ recipient: string; eventId: string; result: unknown }> = [];
      for (const ev of events) {
        const r = await api.post<{ ok: boolean; result?: unknown }>("/v1/admin/dev/events", ev);
        results.push({ recipient: ev.payload.recipient, eventId: ev.payload.eventId, result: r.result ?? r });
        if (!c.json) process.stdout.write(`Posted ${ev.type} for ${ev.payload.recipient} (event ${ev.payload.eventId})\n`);
      }
      if (c.json) c.print(results, () => undefined);
      else process.stdout.write(`\nCheck it with: flaresend emails get ${email.id}\n`);
    });
}

import { Command } from "commander";
import { FlaresendError } from "@flaresend/types";
import { CliError } from "./api";
import { registerDev } from "./commands/dev";
import { registerEmails } from "./commands/emails";
import { registerKeys } from "./commands/keys";
import { registerProjects } from "./commands/projects";
import { registerSend } from "./commands/send";
import { registerStats } from "./commands/stats";
import { registerSuppressions } from "./commands/suppressions";

const ENV_HELP = `
Environment variables:
  FLARESEND_BASE_URL   mailer URL, e.g. https://mailer.example.com or http://localhost:8787 (required)
  FLARESEND_ADMIN_KEY  admin key, used by every command except "send"
  FLARESEND_API_KEY    project API key (fs_live_... or fs_test_...), used by "send"
The --base-url, --admin-key and --api-key flags override these.`;

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("flaresend")
    .description("Command line tool for the Flaresend mailer")
    .version("0.1.0")
    .option("--base-url <url>", "mailer URL (overrides FLARESEND_BASE_URL)")
    .option("--admin-key <key>", "admin key (overrides FLARESEND_ADMIN_KEY)")
    .option("--api-key <key>", "project API key for send (overrides FLARESEND_API_KEY)")
    .option("--json", "print raw JSON instead of tables")
    .showHelpAfterError()
    .addHelpText("after", ENV_HELP);

  registerProjects(program);
  registerKeys(program);
  registerEmails(program);
  registerSuppressions(program);
  registerStats(program);
  registerSend(program);
  registerDev(program);
  return program;
}

export function formatError(err: unknown): string {
  if (err instanceof FlaresendError) {
    const param = err.param ? ` (param: ${err.param})` : "";
    return `Error: ${err.code}: ${err.message}${param} [HTTP ${err.status} ${err.type}]`;
  }
  if (err instanceof CliError) return `Error: ${err.message}`;
  if (err instanceof Error) return `Error: ${err.message}`;
  return `Error: ${String(err)}`;
}

async function main(): Promise<void> {
  try {
    await buildProgram().parseAsync(process.argv);
  } catch (err) {
    process.stderr.write(formatError(err) + "\n");
    if (process.env.FLARESEND_DEBUG && err instanceof Error && err.stack) process.stderr.write(err.stack + "\n");
    process.exitCode = err instanceof CliError ? err.exitCode : 1;
  }
}

void main();

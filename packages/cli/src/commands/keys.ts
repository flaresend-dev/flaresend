import { Option, type Command } from "commander";
import type { ApiKeyRecord, CreatedApiKey } from "@flaresend/types";
import { CliError } from "../api";
import { ctx, enc } from "../context";
import { keyValues, table } from "../format";

function keyStatus(k: ApiKeyRecord): string {
  if (k.revokedAt) return "revoked";
  if (k.expiresAt && new Date(k.expiresAt).getTime() < Date.now()) return "expired";
  return "active";
}

export function registerKeys(program: Command): void {
  const keys = program.command("keys").description("manage project API keys (admin key)");

  keys
    .command("create")
    .description("create an API key for a project; the full key is shown once")
    .requiredOption("--project <slug>", "project slug")
    .requiredOption("--name <name>", "key name, e.g. coolify-prod")
    .addOption(new Option("--mode <mode>", "live sends real email; test only logs").choices(["live", "test"]).default("live"))
    .option("--expires-at <date>", "expiry date (ISO 8601, e.g. 2027-01-01T00:00:00Z)")
    .action(async (opts: { project: string; name: string; mode: "live" | "test"; expiresAt?: string }, cmd: Command) => {
      const c = ctx(cmd);
      let expiresAt: string | undefined;
      if (opts.expiresAt) {
        const d = new Date(opts.expiresAt);
        if (Number.isNaN(d.getTime())) throw new CliError(`--expires-at must be a date, got "${opts.expiresAt}"`);
        expiresAt = d.toISOString();
      }
      const k = await c
        .admin()
        .post<CreatedApiKey>(`/v1/admin/projects/${enc(opts.project)}/api-keys`, { name: opts.name, mode: opts.mode, ...(expiresAt ? { expiresAt } : {}) });
      c.print(k, (x) => {
        const bar = "=".repeat(Math.max(60, x.key.length + 4));
        const lines = [
          `Created ${x.mode} key "${x.name}" (${x.id}) for project ${opts.project}`,
          "",
          bar,
          `  ${x.key}`,
          bar,
          "",
          "This key is shown once. Copy it now; it cannot be shown again.",
        ];
        if (x.expiresAt) lines.push(`Expires: ${x.expiresAt}`);
        return lines.join("\n");
      });
    });

  keys
    .command("list")
    .description("list API keys")
    .option("--project <slug>", "only keys for this project")
    .action(async (opts: { project?: string }, cmd: Command) => {
      const c = ctx(cmd);
      const res = await c.admin().get<{ data: ApiKeyRecord[] }>("/v1/admin/api-keys", { project: opts.project });
      c.print(res, (r) =>
        r.data.length === 0
          ? "No API keys."
          : table(
              ["ID", "NAME", "MODE", "PREFIX", "PROJECT", "STATUS", "LAST USED", "CREATED", "EXPIRES"],
              r.data.map((k) => [k.id, k.name, k.mode, k.prefix, k.projectId, keyStatus(k), k.lastUsedAt, k.createdAt, k.expiresAt]),
              { maxWidths: [undefined, 30] },
            ),
      );
    });

  keys
    .command("revoke <id>")
    .description("revoke an API key")
    .action(async (id: string, _opts, cmd: Command) => {
      const c = ctx(cmd);
      const k = await c.admin().delete<ApiKeyRecord>(`/v1/admin/api-keys/${enc(id)}`);
      c.print(k, (x) => `Revoked key ${x.id} ("${x.name}") at ${x.revokedAt ?? "now"}`);
    });

  keys
    .command("rename <id> <name>")
    .description("rename an API key")
    .action(async (id: string, name: string, _opts, cmd: Command) => {
      const c = ctx(cmd);
      const k = await c.admin().patch<ApiKeyRecord>(`/v1/admin/api-keys/${enc(id)}`, { name });
      c.print(k, (x) => keyValues([["Renamed key", x.id], ["Name", x.name]]));
    });
}

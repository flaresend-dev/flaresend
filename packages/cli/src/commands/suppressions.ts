import { Option, type Command } from "commander";
import type { SuppressionRecord } from "@flaresend/types";
import { parseIntOption } from "../bodies";
import { ctx, enc } from "../context";
import { table } from "../format";

interface SuppressionList {
  data: SuppressionRecord[];
  nextCursor: string | null;
  note?: string;
}

export function registerSuppressions(program: Command): void {
  const sup = program.command("suppressions").description("manage the local suppression list (admin key)");

  sup
    .command("list")
    .description("list suppressed addresses")
    .option("--q <text>", "address contains")
    .option("--limit <n>", "1-100, default 25")
    .option("--cursor <cursor>", "nextCursor from a previous page")
    .action(async (opts: { q?: string; limit?: string; cursor?: string }, cmd: Command) => {
      const c = ctx(cmd);
      const limit = opts.limit !== undefined ? parseIntOption("--limit", opts.limit) : undefined;
      const res = await c.admin().get<SuppressionList>("/v1/admin/suppressions", { q: opts.q, limit, cursor: opts.cursor });
      c.print(res, (r) => {
        const parts: string[] = [];
        parts.push(
          r.data.length === 0
            ? "No suppressed addresses."
            : table(["ADDRESS", "REASON", "SOURCE EMAIL", "CREATED"], r.data.map((s) => [s.address, s.reason, s.sourceEmailId, s.createdAt])),
        );
        if (r.nextCursor) parts.push(`More results: flaresend suppressions list --cursor ${r.nextCursor}`);
        if (r.note) parts.push(`Note: ${r.note}`);
        return parts.join("\n\n");
      });
    });

  sup
    .command("add <address>")
    .description("suppress an address so Flaresend will not send to it")
    .addOption(new Option("--reason <reason>", "why").choices(["manual", "hard_bounce", "complaint"]).default("manual"))
    .action(async (address: string, opts: { reason: string }, cmd: Command) => {
      const c = ctx(cmd);
      const s = await c.admin().post<SuppressionRecord & { note?: string }>("/v1/admin/suppressions", { address, reason: opts.reason });
      c.print(s, (x) => `Suppressed ${x.address} (reason: ${x.reason})${x.note ? `\nNote: ${x.note}` : ""}`);
    });

  sup
    .command("remove <address>")
    .description("remove an address from the local suppression list")
    .action(async (address: string, _opts, cmd: Command) => {
      const c = ctx(cmd);
      const r = await c.admin().delete<{ address: string; deleted: boolean; note?: string }>(`/v1/admin/suppressions/${enc(address)}`);
      c.print(r, (x) => `Removed ${x.address} from the local suppression list.${x.note ? `\nNote: ${x.note}` : ""}`);
    });
}

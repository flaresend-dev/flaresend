import type { Command } from "commander";
import type { StatsRecord } from "@flaresend/types";
import { ctx } from "../context";
import { table, type Cell } from "../format";

const PREFERRED = ["queued", "scheduled", "sending", "sent", "delivered", "deferred", "bounced", "complained", "rejected", "failed", "test", "canceled"];

export function statsTable(data: StatsRecord[]): string {
  if (data.length === 0) return "No projects.";
  const seen = new Set<string>();
  for (const s of data) for (const w of [s.today, s.last7d, s.last30d]) for (const k of Object.keys(w ?? {})) seen.add(k);
  const statuses = [...PREFERRED.filter((k) => seen.has(k)), ...[...seen].filter((k) => !PREFERRED.includes(k)).sort()];

  const rows: Cell[][] = [];
  for (const s of data) {
    for (const [label, w] of [["today", s.today], ["7d", s.last7d], ["30d", s.last30d]] as const) {
      const counts = w ?? {};
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      rows.push([s.slug, label, total, ...statuses.map((k) => counts[k] ?? 0)]);
    }
  }
  const headers = ["PROJECT", "WINDOW", "TOTAL", ...statuses.map((s) => s.toUpperCase())];
  return table(headers, rows, { alignRight: headers.map((_, i) => i).filter((i) => i >= 2) });
}

export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("email counts by status per project for today, 7 days and 30 days (admin key)")
    .action(async (_opts, cmd: Command) => {
      const c = ctx(cmd);
      const res = await c.admin().get<{ data: StatsRecord[] }>("/v1/admin/stats");
      c.print(res, (r) => statsTable(r.data));
    });
}

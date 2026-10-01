// Cron */5 * * * *: enqueue scheduled sends, advance broadcasts, daily rollup.
import { all } from "../db/client";
import { runNewsletterJobs } from "./newsletters";
import type { BroadcastRow } from "../db/contacts";
import { rollupDay } from "../core/analytics";
import { processBroadcastChunk } from "../core/broadcasts";
import { nowIso, utcDay } from "../core/ids";
import { enqueueSendBatch, MAX_QUEUE_DELAY_SECONDS } from "../queue/producer";

/** Scheduled emails due within 12 h that have not been handed to the queue yet. */
export async function enqueueDueScheduled(env: Env, now = Date.now()): Promise<number> {
  const horizon = new Date(now + MAX_QUEUE_DELAY_SECONDS * 1000).toISOString();
  let total = 0;
  for (let round = 0; round < 10; round++) {
    const rows = await all<{ id: string; project_id: string; scheduled_at: string }>(
      env.DB.prepare(
        "SELECT id, project_id, scheduled_at FROM emails WHERE status = 'scheduled' AND scheduled_at <= ? AND enqueued_at IS NULL ORDER BY scheduled_at LIMIT 100",
      ).bind(horizon),
    );
    if (rows.length === 0) break;
    await enqueueSendBatch(
      env,
      rows.map((r) => ({
        body: { kind: "send" as const, emailId: r.id, projectId: r.project_id, attempt: 0 },
        delaySeconds: Math.max(0, Math.ceil((new Date(r.scheduled_at).getTime() - now) / 1000)),
      })),
    );
    const at = nowIso();
    await env.DB.batch(rows.map((r) => env.DB.prepare("UPDATE emails SET enqueued_at = ? WHERE id = ? AND enqueued_at IS NULL").bind(at, r.id)));
    total += rows.length;
    if (rows.length < 100) break;
  }
  return total;
}

export async function advanceBroadcasts(env: Env, now = Date.now()): Promise<number> {
  const at = new Date(now).toISOString();
  await env.DB.prepare(
    "UPDATE broadcasts SET status = 'sending', started_at = COALESCE(started_at, ?), updated_at = ? WHERE status = 'scheduled' AND scheduled_at <= ?",
  ).bind(at, at, at).run();
  const sending = await all<BroadcastRow>(env.DB.prepare("SELECT * FROM broadcasts WHERE status = 'sending' ORDER BY started_at LIMIT 10"));
  let sent = 0;
  for (const b of sending) {
    try {
      sent += (await processBroadcastChunk(env, b)).sent;
    } catch (err) {
      console.error("broadcast chunk failed", { broadcastId: b.id, err: String(err) });
    }
  }
  return sent;
}

/** Roll up yesterday once, on the first tick at or after 00:10 UTC (guarded by the _done row). */
export async function maybeRollup(env: Env, now = new Date()): Promise<boolean> {
  if (now.getUTCHours() === 0 && now.getUTCMinutes() < 10) return false;
  return rollupDay(env.DB, utcDay(new Date(now.getTime() - 86400_000)));
}

export async function runScheduled(env: Env, scheduledTime = Date.now()): Promise<void> {
  const results = await Promise.allSettled([
    runNewsletterJobs(env, scheduledTime),
    enqueueDueScheduled(env, scheduledTime),
    advanceBroadcasts(env, scheduledTime),
    maybeRollup(env, new Date(scheduledTime)),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("cron task failed", String(r.reason));
  console.log("cron done", results.map((r) => (r.status === "fulfilled" ? r.value : "error")));
}

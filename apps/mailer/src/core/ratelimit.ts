import type { ProjectRow } from "../db/projects";
import { ApiError } from "../http/errors";
import { utcDay } from "./ids";

/** Global per-project safety valve (Workers rate limiting binding). */
export async function checkRateLimit(env: Env, project: ProjectRow): Promise<void> {
  const { success } = await env.RATE_LIMITER.limit({ key: project.id });
  if (!success) throw ApiError.rateLimited("rate_limited", "too many requests for this project; slow down and retry");
}

/**
 * Per-project daily counter (UTC day). The conditional upsert only increments while count < daily_limit,
 * so meta.changes tells us whether this send fits. daily_limit = 0 means no limit.
 */
export async function checkDailyLimit(env: Env, project: ProjectRow, n = 1): Promise<void> {
  if (project.daily_limit <= 0) return;
  const day = utcDay();
  const r = await env.DB.prepare(
    `INSERT INTO daily_counts (project_id, day, count) VALUES (?1, ?2, ?3)
     ON CONFLICT(project_id, day) DO UPDATE SET count = count + ?3 WHERE count + ?3 <= ?4`,
  )
    .bind(project.id, day, n, project.daily_limit)
    .run();
  if (r.meta.changes !== 1 || n > project.daily_limit) {
    throw ApiError.rateLimited("daily_limit_exceeded", `daily limit of ${project.daily_limit} emails reached for this project (resets 00:00 UTC)`);
  }
}

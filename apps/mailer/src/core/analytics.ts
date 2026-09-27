// Analytics.
// Buckets are by the email's created_at (UTC). Metric definitions:
//   sent       = live emails that were handed to Cloudflare (sent_at IS NOT NULL)
//   delivered / deferred / bounced / complained / rejected / failed = emails whose current status is that value
//   opened     = emails with opened_at set;  clicked = emails with first_clicked_at set
// So for any closed day, each status metric equals `SELECT status, count(*) FROM emails WHERE <that day> GROUP BY status`.
// Closed days come from analytics_daily once the cron has rolled them up; other days are computed live.
import { ANALYTICS_METRICS, AnalyticsQuery, type AnalyticsBucket, type AnalyticsMetric, type AnalyticsResult } from "@flaresend/types";
import { all, one } from "../db/client";
import { ApiError } from "../http/errors";
import { utcDay } from "./ids";

type Counts = Record<AnalyticsMetric, number>;

const METRIC_SQL = `
  SUM(CASE WHEN e.sent_at IS NOT NULL THEN 1 ELSE 0 END) AS sent,
  SUM(CASE WHEN e.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
  SUM(CASE WHEN e.status = 'deferred' THEN 1 ELSE 0 END) AS deferred,
  SUM(CASE WHEN e.status = 'bounced' THEN 1 ELSE 0 END) AS bounced,
  SUM(CASE WHEN e.status = 'complained' THEN 1 ELSE 0 END) AS complained,
  SUM(CASE WHEN e.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
  SUM(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN e.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
  SUM(CASE WHEN e.first_clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked`;

export function emptyCounts(): Counts {
  return Object.fromEntries(ANALYTICS_METRICS.map((m) => [m, 0])) as Counts;
}

function addInto(target: Counts, src: Partial<Record<AnalyticsMetric, number | null>>): void {
  for (const m of ANALYTICS_METRICS) target[m] += Number(src[m] ?? 0);
}

function projectClause(projectId: string | null, params: unknown[], alias = "e"): string {
  if (!projectId) return "";
  params.push(projectId);
  return ` AND ${alias}.project_id = ?`;
}

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

export function dayList(days: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(utcDay(new Date(now.getTime() - i * 86400_000)));
  return out;
}

/** Live per-project counts for one UTC day (used by the rollup and for un-rolled days). */
export async function liveDayCounts(db: D1Database, day: string): Promise<Array<{ project_id: string } & Counts>> {
  return all(
    db.prepare(
      `SELECT e.project_id, ${METRIC_SQL} FROM emails e
       WHERE e.mode = 'live' AND e.created_at >= ? AND e.created_at < ? GROUP BY e.project_id`,
    ).bind(`${day}T00:00:00.000Z`, nextDay(day)),
  );
}

function nextDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 86400_000).toISOString();
}

export async function rollupDay(db: D1Database, day: string): Promise<boolean> {
  const done = await one(db.prepare("SELECT 1 AS x FROM analytics_daily WHERE project_id = '_all' AND day = ? AND metric = '_done'").bind(day));
  if (done) return false;
  const rows = await liveDayCounts(db, day);
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    for (const m of ANALYTICS_METRICS) {
      stmts.push(
        db.prepare("INSERT OR REPLACE INTO analytics_daily (project_id, day, metric, count) VALUES (?, ?, ?, ?)").bind(r.project_id, day, m, Number(r[m] ?? 0)),
      );
    }
  }
  stmts.push(db.prepare("INSERT OR REPLACE INTO analytics_daily (project_id, day, metric, count) VALUES ('_all', ?, '_done', 1)").bind(day));
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return true;
}

async function percentile(db: D1Database, where: string, params: unknown[], p: number): Promise<number | null> {
  const countRow = await one<{ n: number }>(
    db.prepare(`SELECT COUNT(*) AS n FROM email_recipients r JOIN emails e ON e.id = r.email_id WHERE r.delivery_ms IS NOT NULL ${where}`).bind(...params),
  );
  const n = countRow?.n ?? 0;
  if (n === 0) return null;
  const offset = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  const row = await one<{ v: number }>(
    db.prepare(
      `SELECT r.delivery_ms AS v FROM email_recipients r JOIN emails e ON e.id = r.email_id
       WHERE r.delivery_ms IS NOT NULL ${where} ORDER BY r.delivery_ms LIMIT 1 OFFSET ?`,
    ).bind(...params, offset),
  );
  return row?.v ?? null;
}

export async function getAnalytics(env: Env, raw: unknown, projectId: string | null): Promise<AnalyticsResult> {
  const parsed = AnalyticsQuery.safeParse(raw ?? {});
  if (!parsed.success) throw ApiError.fromZod(parsed.error, "invalid_query");
  const { range, interval } = parsed.data;
  const db = env.DB;
  const days = dayList(RANGE_DAYS[range]);
  const start = `${days[0]}T00:00:00.000Z`;
  const buckets = new Map<string, Counts>();

  if (interval === "hour") {
    const params: unknown[] = [start];
    const pc = projectClause(projectId, params);
    const rows = await all<{ bucket: string } & Counts>(
      db.prepare(`SELECT substr(e.created_at, 1, 13) AS bucket, ${METRIC_SQL} FROM emails e WHERE e.mode = 'live' AND e.created_at >= ?${pc} GROUP BY bucket`).bind(...params),
    );
    for (const r of rows) {
      const c = emptyCounts();
      addInto(c, r);
      buckets.set(r.bucket, c);
    }
  } else {
    for (const d of days) buckets.set(d, emptyCounts());
    // Rolled-up closed days.
    const doneRows = await all<{ day: string }>(
      db.prepare("SELECT day FROM analytics_daily WHERE project_id = '_all' AND metric = '_done' AND day >= ?").bind(days[0]),
    );
    const done = new Set(doneRows.map((r) => r.day));
    const today = utcDay();
    done.delete(today);
    if (done.size) {
      const params: unknown[] = [days[0]];
      const pc = projectId ? " AND project_id = ?" : " AND project_id <> '_all'";
      if (projectId) params.push(projectId);
      const rows = await all<{ day: string; metric: string; count: number }>(
        db.prepare(`SELECT day, metric, SUM(count) AS count FROM analytics_daily WHERE day >= ?${pc} AND metric <> '_done' GROUP BY day, metric`).bind(...params),
      );
      for (const r of rows) {
        if (!done.has(r.day)) continue;
        const c = buckets.get(r.day);
        if (c && (ANALYTICS_METRICS as readonly string[]).includes(r.metric)) c[r.metric as AnalyticsMetric] += Number(r.count);
      }
    }
    // Everything else (today + any day not rolled up) live, in one grouped query.
    const params: unknown[] = [start];
    const pc = projectClause(projectId, params);
    const rows = await all<{ bucket: string } & Counts>(
      db.prepare(`SELECT substr(e.created_at, 1, 10) AS bucket, ${METRIC_SQL} FROM emails e WHERE e.mode = 'live' AND e.created_at >= ?${pc} GROUP BY bucket`).bind(...params),
    );
    for (const r of rows) {
      if (done.has(r.bucket)) continue;
      const c = buckets.get(r.bucket);
      if (c) addInto(c, r);
    }
  }

  const list: AnalyticsBucket[] = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, c]) => ({ bucket, ...c }));
  const totals = emptyCounts();
  for (const b of list) addInto(totals, b);

  const pParams: unknown[] = [start];
  const pWhere = " AND e.created_at >= ?" + projectClause(projectId, pParams);
  const [p50, p95] = await Promise.all([percentile(db, pWhere, pParams, 0.5), percentile(db, pWhere, pParams, 0.95)]);

  const tagParams: unknown[] = [start];
  const tagPc = projectClause(projectId, tagParams);
  const topTags = await all<{ tag: string; count: number }>(
    db.prepare(
      `SELECT j.key || ':' || j.value AS tag, COUNT(*) AS count FROM emails e, json_each(e.tags) j
       WHERE e.tags IS NOT NULL AND e.created_at >= ?${tagPc} GROUP BY tag ORDER BY count DESC LIMIT 10`,
    ).bind(...tagParams),
  );
  const bParams: unknown[] = [start];
  const bPc = projectClause(projectId, bParams);
  const topBouncedDomains = await all<{ domain: string; count: number }>(
    db.prepare(
      `SELECT substr(r.address, instr(r.address, '@') + 1) AS domain, COUNT(*) AS count
       FROM email_recipients r JOIN emails e ON e.id = r.email_id
       WHERE r.status = 'bounced' AND e.created_at >= ?${bPc} GROUP BY domain ORDER BY count DESC LIMIT 10`,
    ).bind(...bParams),
  );

  const rate = (n: number) => (totals.sent > 0 ? Math.round((n / totals.sent) * 10000) / 10000 : null);
  return {
    range,
    interval,
    buckets: list,
    totals,
    deliveryRate: rate(totals.delivered),
    bounceRate: rate(totals.bounced),
    complaintRate: rate(totals.complained),
    p50DeliveryMs: p50,
    p95DeliveryMs: p95,
    topTags,
    topBouncedDomains,
  };
}

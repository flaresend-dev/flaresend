import type { ProjectRow } from "../../db/projects";
import { ApiError } from "../../http/errors";
import { all, one, requirePublication } from "./shared";
import { subscriberCounts } from "./subscriptions";

export async function reports(
  env: Env,
  project: ProjectRow,
  id: string,
  input: { since?: string; until?: string } = {},
) {
  const pub = await requirePublication(env, project.id, id);
  const until = new Date(input.until ?? Date.now()),
    since = new Date(input.since ?? until.getTime() - 30 * 86400_000);
  if (
    !Number.isFinite(until.getTime()) ||
    !Number.isFinite(since.getTime()) ||
    until <= since ||
    until.getTime() - since.getTime() > 366 * 86400_000
  )
    throw ApiError.validation(
      "invalid_range",
      "Select a date range of at most 366 days.",
    );
  const counts = await subscriberCounts(env, project, id);
  const events = await all<{ type: string; occurred_at: string }>(
    env.DB.prepare(
      "SELECT type,occurred_at FROM newsletter_subscription_events WHERE publication_id=? AND occurred_at>=? AND occurred_at<?",
    ).bind(id, since.toISOString(), until.toISOString()),
  );
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: pub.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const days = new Map<
    string,
    { date: string; subscribed: number; unsubscribed: number }
  >();
  for (const e of events) {
    const date = formatter.format(new Date(e.occurred_at));
    const day = days.get(date) ?? { date, subscribed: 0, unsubscribed: 0 };
    if (e.type === "subscribed") day.subscribed++;
    if (e.type === "unsubscribed") day.unsubscribed++;
    days.set(date, day);
  }
  const sources = await all<{ source: string; count: number }>(
    env.DB.prepare(
      "SELECT source,COUNT(*) AS count FROM newsletter_subscriptions WHERE publication_id=? AND status='subscribed' GROUP BY source ORDER BY count DESC",
    ).bind(id),
  );
  const published = await one<{ n: number }>(
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM newsletter_posts WHERE publication_id=? AND public_revision_id IS NOT NULL",
    ).bind(id),
  );
  return {
    active: counts.eligible,
    pending: counts.excluded.pending,
    unsubscribed: counts.excluded.unsubscribed,
    published: published?.n ?? 0,
    newSubscriptions: events.filter((e) => e.type === "subscribed").length,
    unsubscribeCount: events.filter((e) => e.type === "unsubscribed").length,
    sources,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    emailAvailable: false as const,
  };
}

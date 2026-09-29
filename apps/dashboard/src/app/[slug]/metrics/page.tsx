import { mailerCall } from "@/lib/mailer";
import type { SearchParamsProp, SlugParams } from "@/lib/project";
import { first } from "@/lib/email-query";
import { ALL } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { PageError } from "@/components/page-error";
import { MetricsControls, MetricsView } from "@/components/metrics/metrics-view";

export const metadata = { title: "Metrics" };

const RANGES = ["7d", "30d", "90d"] as const;

export default async function MetricsPage({ params, searchParams }: SlugParams & SearchParamsProp) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const range = (RANGES as readonly string[]).includes(first(sp.range)) ? (first(sp.range) as (typeof RANGES)[number]) : "7d";
  const interval = first(sp.interval) === "hour" ? "hour" : "day";
  const a = await mailerCall((m) => m.analytics({ range, interval, ...(slug === ALL ? {} : { project: slug }) }));

  return (
    <>
      <PageHeader
        title="Metrics"
        description="Closed days come from the nightly rollup. Today is live."
        actions={<MetricsControls range={range} interval={interval} />}
      />
      {a.ok ? <MetricsView data={a.data} /> : <PageError error={a.error} title="Could not load metrics" />}
    </>
  );
}

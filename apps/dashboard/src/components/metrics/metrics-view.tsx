"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { AnalyticsResult } from "@flaresend/types";
import { ms, num, pct, ratio } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";

type Metric = "sent" | "delivered" | "bounced" | "complained" | "opened" | "clicked";

const TILES: Array<{ key: Metric; label: string; color: string }> = [
  { key: "sent", label: "Sent", color: "var(--series-1)" },
  { key: "delivered", label: "Delivered", color: "var(--series-3)" },
  { key: "bounced", label: "Bounced", color: "var(--series-2)" },
  { key: "complained", label: "Complained", color: "var(--series-5)" },
  { key: "opened", label: "Opened", color: "var(--series-4)" },
  { key: "clicked", label: "Clicked", color: "var(--series-1)" },
];

const TABLE_KEYS = ["sent", "delivered", "deferred", "bounced", "complained", "rejected", "failed", "opened", "clicked"] as const;

/** "2026-09-25" -> "Sep 25"; "2026-09-25T14" -> "Sep 25, 14:00". Buckets are UTC. */
function bucketLabel(bucket: string, interval: "day" | "hour", withDay = true): string {
  const d = new Date(interval === "hour" ? `${bucket.slice(0, 13)}:00:00Z` : `${bucket.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return bucket;
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  if (interval === "day") return day;
  const hour = `${bucket.slice(11, 13)}:00`;
  return withDay ? `${day}, ${hour}` : hour;
}

function ChartTooltip({ active, payload, label, metric, interval }: TooltipContentProps<number, string> & { metric: (typeof TILES)[number]; interval: "day" | "hour" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-background-elevated px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 text-foreground-muted">{bucketLabel(String(label), interval)} UTC</p>
      <p className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: metric.color }} />
        <span className="text-foreground-muted">{metric.label}</span>
        <span className="ml-auto pl-4 font-medium tabular-nums">{num(Number(payload[0]?.value ?? 0))}</span>
      </p>
    </div>
  );
}

export function MetricsControls({ range, interval }: { range: string; interval: "day" | "hour" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const push = (k: string, v: string) => {
    const u = new URLSearchParams(sp.toString());
    u.set(k, v);
    router.push(`${pathname}?${u}`, { scroll: false });
  };
  return (
    <>
      <Select
        ariaLabel="Date range"
        className="w-36"
        value={range}
        onValueChange={(v) => push("range", v)}
        options={[
          { value: "7d", label: "Last 7 days" },
          { value: "30d", label: "Last 30 days" },
          { value: "90d", label: "Last 90 days" },
        ]}
      />
      <Segmented
        ariaLabel="Interval"
        value={interval}
        onChange={(v) => push("interval", v)}
        options={[
          { value: "day", label: "Day" },
          { value: "hour", label: "Hour" },
        ]}
      />
    </>
  );
}

export function MetricsView({ data }: { data: AnalyticsResult }) {
  const [metric, setMetric] = useState<Metric>("delivered");
  const t = data.totals;
  const sent = t.sent;
  const rate = (n: number) => (sent > 0 ? pct(ratio(n, sent)) : "—");
  const tileValue: Record<Metric, { value: string; sub?: string }> = {
    sent: { value: num(sent) },
    delivered: { value: sent > 0 ? pct(data.deliveryRate) : "—", sub: num(t.delivered) },
    bounced: { value: sent > 0 ? pct(data.bounceRate) : "—", sub: num(t.bounced) },
    complained: { value: sent > 0 ? pct(data.complaintRate, 2) : "—", sub: num(t.complained) },
    opened: { value: rate(t.opened), sub: num(t.opened) },
    clicked: { value: rate(t.clicked), sub: num(t.clicked) },
  };
  const active = TILES.find((x) => x.key === metric)!;
  const axis = { stroke: "var(--foreground-subtle)", fontSize: 11, tickLine: false, axisLine: false } as const;
  const gradientId = `fill-${metric}`;

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Metric" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map((tile) => {
          const v = tileValue[tile.key];
          const selected = tile.key === metric;
          return (
            <button
              key={tile.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMetric(tile.key)}
              className={cn(
                "flex min-w-0 flex-col gap-1 rounded-lg border bg-background-elevated px-4 py-3 text-left shadow-card transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-foreground/40 ring-1 ring-foreground/10" : "border-border hover:border-border-strong hover:bg-background-hover",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
                <span className={cn("size-2 rounded-full transition-opacity", selected ? "opacity-100" : "opacity-40")} style={{ background: tile.color }} />
                {tile.label}
              </span>
              <span className="text-stat font-semibold tabular-nums">{v.value}</span>
              <span className="h-4 text-xs text-foreground-muted tabular-nums">{v.sub ?? ""}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{active.label}</CardTitle>
          <p className="text-xs text-foreground-muted">Per {data.interval}, UTC</p>
        </CardHeader>
        <CardContent>
          {sent === 0 ? (
            <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed border-border text-sm text-foreground-muted">
              No emails in this range
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.buckets} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={active.color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={active.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="bucket" {...axis} minTickGap={24} tickFormatter={(b: string) => bucketLabel(b, data.interval, false)} />
                  <YAxis {...axis} allowDecimals={false} width={48} tickFormatter={(v: number) => num(v)} />
                  <Tooltip
                    cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                    content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} metric={active} interval={data.interval} />}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    name={active.label}
                    stroke={active.color}
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    activeDot={{ r: 4, stroke: "var(--background-elevated)", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <details className="group mt-4">
            <summary className="w-fit cursor-pointer list-none text-xs font-medium text-foreground-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show table</span>
              <span className="hidden group-open:inline">Hide table</span>
            </summary>
            <Table wrapperClassName="mt-3 shadow-none" className="min-w-[760px]">
              <THead>
                <tr>
                  <TH className="w-[130px]">Bucket (UTC)</TH>
                  {TABLE_KEYS.map((k) => (
                    <TH key={k} className="text-right capitalize">
                      {k}
                    </TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {data.buckets.map((b) => (
                  <tr key={b.bucket}>
                    <TD className="whitespace-nowrap text-foreground-muted">{bucketLabel(b.bucket, data.interval)}</TD>
                    {TABLE_KEYS.map((k) => (
                      <TD key={k} className="text-right tabular-nums">
                        {num(b[k])}
                      </TD>
                    ))}
                  </tr>
                ))}
              </TBody>
            </Table>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Delivery time</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-foreground-muted">p50</p>
              <p className="text-title font-semibold tabular-nums">{data.p50DeliveryMs !== null ? ms(data.p50DeliveryMs) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-foreground-muted">p95</p>
              <p className="text-title font-semibold tabular-nums">{data.p95DeliveryMs !== null ? ms(data.p95DeliveryMs) : "—"}</p>
            </div>
          </CardContent>
        </Card>
        <RankCard title="Top tags" empty="No tagged emails in this range." rows={data.topTags.map((x) => ({ key: x.tag, count: x.count }))} />
        <RankCard title="Top bounced domains" empty="No bounces in this range." rows={data.topBouncedDomains.map((x) => ({ key: x.domain, count: x.count }))} />
      </div>
    </div>
  );
}

function RankCard({ title, rows, empty }: { title: string; rows: Array<{ key: string; count: number }>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="flex flex-col gap-1">
            {rows.slice(0, 6).map((r) => (
              <li key={r.key} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2 py-1 text-sm">
                <span className="absolute inset-y-0 left-0 rounded-md bg-background-hover" style={{ width: `${(r.count / max) * 100}%` }} aria-hidden />
                <span className="relative truncate font-mono text-xs">{r.key}</span>
                <span className="relative tabular-nums text-foreground-muted">{num(r.count)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground-muted">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

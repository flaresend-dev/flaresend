"use client";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { num } from "@/lib/format";

export interface SubscriberPoint {
  date: string;
  total: number;
  joined: number;
  left: number;
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

function ChartTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload as SubscriberPoint;
  return (
    <div className="rounded-md border border-border bg-background-elevated px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 text-foreground-muted">{fmt(p.date)}</p>
      <p className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-series-1" />
        <span className="text-foreground-muted">Subscribers</span>
        <span className="ml-auto pl-4 font-medium tabular-nums">{num(p.total)}</span>
      </p>
      {p.joined || p.left ? (
        <p className="mt-0.5 text-foreground-muted tabular-nums">
          +{num(p.joined)} joined · {num(p.left)} left
        </p>
      ) : null}
    </div>
  );
}

export function SubscriberChart({ data }: { data: SubscriberPoint[] }) {
  const gradient = useId().replace(/:/g, "");
  const axis = { stroke: "var(--foreground-subtle)", fontSize: 11, tickLine: false, axisLine: false } as const;
  const min = Math.min(...data.map((d) => d.total));
  const max = Math.max(...data.map((d) => d.total));
  const pad = Math.max(2, Math.ceil((max - min) * 0.15));
  return (
    <div
      className="h-[240px]"
      role="img"
      aria-label={`Subscribers from ${num(data[0]?.total ?? 0)} on ${data[0] ? fmt(data[0].date) : ""} to ${num(data.at(-1)?.total ?? 0)} today`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" {...axis} minTickGap={32} tickFormatter={fmt} />
          <YAxis {...axis} allowDecimals={false} width={48} domain={[Math.max(0, min - pad), max + pad]} tickFormatter={(v: number) => num(v)} />
          <Tooltip cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} />} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill={`url(#${gradient})`}
            activeDot={{ r: 4, stroke: "var(--background-elevated)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

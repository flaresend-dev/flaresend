import { z } from "zod";

export const ANALYTICS_METRICS = ["sent", "delivered", "deferred", "bounced", "complained", "rejected", "failed", "opened", "clicked"] as const;
export type AnalyticsMetric = (typeof ANALYTICS_METRICS)[number];

export const AnalyticsQuery = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("7d"),
  interval: z.enum(["day", "hour"]).default("day"),
});
export type AnalyticsQuery = z.input<typeof AnalyticsQuery>;

export type AnalyticsBucket = Record<AnalyticsMetric, number> & {
  bucket: string; // "2026-09-25" or "2026-09-25T14"
};

export interface AnalyticsResult {
  range: string;
  interval: "day" | "hour";
  buckets: AnalyticsBucket[];
  totals: Record<AnalyticsMetric, number>;
  deliveryRate: number | null;
  bounceRate: number | null;
  complaintRate: number | null;
  p50DeliveryMs: number | null;
  p95DeliveryMs: number | null;
  topTags: Array<{ tag: string; count: number }>;
  topBouncedDomains: Array<{ domain: string; count: number }>;
}

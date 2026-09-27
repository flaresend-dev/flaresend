import { ms } from "@/lib/format";

const MS_KEYS = new Set(["latencyMs", "deliveryMs", "delivery_ms", "latency_ms", "durationMs", "deliveryTimeMs"]);

/** Renders an event's `data` blob (SMTP response, provider, latency, bounce/failure details) as a compact list. */
export function EventData({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  if (typeof data !== "object") return <span className="font-mono text-xs">{String(data)}</span>;
  const entries = Object.entries(data as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) return <p className="text-xs text-foreground-subtle">No details.</p>;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-foreground-muted">{k}</dt>
          <dd className="min-w-0 break-all font-mono text-foreground">
            {typeof v === "number" && MS_KEYS.has(k) ? (
              ms(v)
            ) : typeof v === "object" ? (
              <pre className="whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
            ) : (
              String(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

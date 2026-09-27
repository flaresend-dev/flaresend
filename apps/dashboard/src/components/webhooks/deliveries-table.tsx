"use client";

import { useState } from "react";
import type { WebhookDeliveryRecord } from "@flaresend/types";
import { statusLabel } from "@/lib/labels";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CodeBlock, IdChip } from "@/components/ui/code";
import { DetailList, Sheet } from "@/components/ui/sheet";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Time } from "@/components/ui/time";

function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/** Deliveries of one webhook. Row click opens the response in a sheet. */
export function DeliveriesTable({ deliveries }: { deliveries: WebhookDeliveryRecord[] }) {
  const [open, setOpen] = useState<WebhookDeliveryRecord | null>(null);
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Event</TH>
            <TH className="w-[130px]">Status</TH>
            <TH className="w-[100px]">Response</TH>
            <TH className="hidden w-[80px] md:table-cell">Attempt</TH>
            <TH className="hidden w-[130px] md:table-cell">Next attempt</TH>
            <TH className="w-[100px] text-right">Time</TH>
          </tr>
        </THead>
        <TBody>
          {deliveries.map((d) => (
            <tr
              key={d.id}
              tabIndex={0}
              className="cursor-pointer transition-colors hover:bg-background-hover focus-visible:bg-background-hover focus-visible:outline-none"
              onClick={(e) => !(e.target as HTMLElement).closest("button,a") && setOpen(d)}
              onKeyDown={(e) => e.key === "Enter" && setOpen(d)}
            >
              <TD>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{d.eventType ? statusLabel(d.eventType) : "Event"}</span>
                  <IdChip value={d.eventId} length={12} className="hidden sm:inline-flex" />
                </span>
              </TD>
              <TD>
                <StatusBadge status={d.status} />
              </TD>
              <TD>{d.responseCode !== null ? <Badge mono tone={d.responseCode < 300 ? "success" : "danger"}>{d.responseCode}</Badge> : <span className="text-foreground-subtle">—</span>}</TD>
              <TD className="hidden tabular-nums text-foreground-muted md:table-cell">{d.attempt}</TD>
              <TD className="hidden text-foreground-muted md:table-cell">{d.status === "pending" && d.nextAttemptAt ? <Time iso={d.nextAttemptAt} /> : "—"}</TD>
              <TD className="text-right text-foreground-muted">
                <Time iso={d.createdAt} />
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>
      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)} title={open?.eventType ? statusLabel(open.eventType) : "Delivery"} description="Webhook delivery">
        {open ? (
          <div className="flex flex-col gap-5">
            <DetailList
              items={[
                ["Status", <StatusBadge key="s" status={open.status} />],
                ["Response", open.responseCode !== null ? <span className="font-mono">{open.responseCode}</span> : "—"],
                ["Attempt", String(open.attempt)],
                ["Event ID", <IdChip key="e" value={open.eventId} length={24} className="-ml-1.5" />],
                ["Delivery ID", <IdChip key="d" value={open.id} length={24} className="-ml-1.5" />],
                ["Created", <Time key="c" iso={open.createdAt} format="absolute" />],
                open.completedAt ? ["Completed", <Time key="x" iso={open.completedAt} format="absolute" />] : null,
                open.nextAttemptAt ? ["Next attempt", <Time key="n" iso={open.nextAttemptAt} format="absolute" />] : null,
              ]}
            />
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground-muted">Response body</h3>
              {open.responseBody ? <CodeBlock code={prettyBody(open.responseBody)} maxHeight="50vh" /> : <p className="text-sm text-foreground-muted">Empty.</p>}
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

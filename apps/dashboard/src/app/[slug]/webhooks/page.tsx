import { Webhook } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import type { SlugParams } from "@/lib/project";
import { statusLabel } from "@/lib/labels";
import { p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Time } from "@/components/ui/time";
import { Tooltip } from "@/components/ui/tooltip";
import { PageError } from "@/components/page-error";
import { AddWebhookButton, WebhookEnabledSwitch } from "@/components/webhooks/webhook-controls";

export const metadata = { title: "Webhooks" };

export default async function WebhooksPage({ params }: SlugParams) {
  const { slug } = await params;
  const hooks = await mailerCall((m) => m.listWebhooks(slug));

  return (
    <>
      <PageHeader title="Webhooks" description="Get a signed POST when something happens to an email." actions={<AddWebhookButton slug={slug} />} />
      {!hooks.ok ? (
        <PageError error={hooks.error} title="Could not load webhooks" />
      ) : hooks.data.length === 0 ? (
        <EmptyState icon={<Webhook />} title="No webhooks yet" action={<AddWebhookButton slug={slug} autoOpen={false} />}>
          Add an endpoint to hear about deliveries, bounces, complaints, opens and clicks as they happen.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Endpoint</TH>
              <TH className="w-[150px]">Status</TH>
              <TH className="w-[130px]">Events</TH>
              <TH className="hidden w-[120px] md:table-cell">Created</TH>
            </tr>
          </THead>
          <TBody>
            {hooks.data.map((w) => {
              const all = w.events.includes("*");
              return (
                <TR key={w.id} href={p(slug, "webhooks", w.id)} label={`Open webhook ${w.url}`}>
                  <TD className="truncate font-mono text-xs">
                    <Tooltip content={<span className="font-mono break-all">{w.url}</span>}>
                      <span className="relative z-10">{w.url}</span>
                    </Tooltip>
                  </TD>
                  <TD>
                    <WebhookEnabledSwitch slug={slug} id={w.id} enabled={w.enabled} />
                  </TD>
                  <TD className="text-foreground-muted">
                    {all ? (
                      "All events"
                    ) : (
                      <Tooltip content={<span className="flex flex-col">{w.events.map((e) => <span key={e}>{statusLabel(e)}</span>)}</span>}>
                        <span className="relative z-10">
                          {w.events.length} {w.events.length === 1 ? "event" : "events"}
                        </span>
                      </Tooltip>
                    )}
                  </TD>
                  <TD className="hidden text-foreground-muted md:table-cell">
                    <Time iso={w.createdAt} format="date" />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}

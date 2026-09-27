import { notFound } from "next/navigation";
import { Send } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import type { SearchParamsProp } from "@/lib/project";
import { first, withParams } from "@/lib/email-query";
import { p } from "@/lib/nav";
import { updateWebhookAction } from "@/app/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock, IdChip } from "@/components/ui/code";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { SwitchField } from "@/components/ui/switch";
import { CursorPagination } from "@/components/ui/pagination";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { EventsPicker } from "@/components/webhooks/events-picker";
import { RotateSecretButton, WebhookActions } from "@/components/webhooks/webhook-controls";
import { DeliveriesTable } from "@/components/webhooks/deliveries-table";

export const metadata = { title: "Webhook" };

const VERIFY_SNIPPET = `import { verifyWebhookSignature } from "@flaresend/client/webhooks";

const ok = await verifyWebhookSignature(
  process.env.FLARESEND_WEBHOOK_SECRET!,
  request.headers.get("Flaresend-Signature"),
  await request.text(), // the raw body, before JSON.parse
);`;

export default async function WebhookPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }> } & SearchParamsProp) {
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  const cursor = first(sp.cursor);
  const [hook, deliveries] = await Promise.all([
    mailerCall((m) => m.getWebhook(slug, id)),
    mailerCall((m) => m.listWebhookDeliveries(slug, id, { limit: 50, ...(cursor ? { cursor } : {}) })),
  ]);
  if (!hook.ok) {
    if (hook.error.code.includes("not_found")) notFound();
    return <PageError error={hook.error} title="Could not load this webhook" />;
  }
  const w = hook.data;
  const base = p(slug, "webhooks", id);

  return (
    <>
      <PageHeader
        back={{ href: p(slug, "webhooks"), label: "Webhooks" }}
        title={<span className="font-mono text-section break-all md:text-lg">{w.url}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <IdChip value={w.id} className="-ml-1.5" />
            <span className="text-foreground-subtle" aria-hidden>
              ·
            </span>
            <span>
              Created <Time iso={w.createdAt} format="date" />
            </span>
          </span>
        }
        actions={<WebhookActions slug={slug} id={id} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <ActionForm
            action={updateWebhookAction.bind(null, slug, id)}
            className="gap-0"
            statusClassName="mx-5 mb-4 w-auto"
            footer={
              <CardFooter>
                <SubmitButton>Save</SubmitButton>
              </CardFooter>
            }
          >
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Field label="Endpoint URL" htmlFor="wh-url">
                <Input id="wh-url" name="url" type="url" required defaultValue={w.url} className="font-mono" />
              </Field>
              <EventsPicker selected={w.events} />
              <SwitchField name="enabled" defaultChecked={w.enabled} label="Enabled" />
            </CardContent>
          </ActionForm>
        </Card>

        <Card>
          <CardHeader actions={<RotateSecretButton slug={slug} id={id} />}>
            <CardTitle>Signing</CardTitle>
            <CardDescription>
              Every request carries a <code className="font-mono text-xs text-foreground">Flaresend-Signature</code> header:{" "}
              <code className="font-mono text-xs text-foreground">t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>, an HMAC-SHA256 of{" "}
              <code className="font-mono text-xs text-foreground">{"`${t}.${rawBody}`"}</code> keyed with the signing secret.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CodeBlock code={VERIFY_SNIPPET} />
            <p className="text-xs text-foreground-muted">
              <code className="font-mono">verifyWebhookSignature</code> is in <code className="font-mono">packages/client/src/webhooks.ts</code>. It rejects
              timestamps more than 5 minutes old. The secret is shown only when the webhook is created or the secret is rotated.
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-section font-semibold">Deliveries</h2>
        {!deliveries.ok ? (
          <PageError error={deliveries.error} title="Could not load deliveries" />
        ) : deliveries.data.data.length === 0 ? (
          <EmptyState icon={<Send />} title={cursor ? "No more deliveries" : "No deliveries yet"}>
            Send a test event to check your endpoint.
          </EmptyState>
        ) : (
          <>
            <DeliveriesTable deliveries={deliveries.data.data} />
            <CursorPagination
              count={deliveries.data.data.length}
              hrefPrev={cursor ? base : null}
              hrefNext={deliveries.data.nextCursor ? withParams(base, sp, { cursor: deliveries.data.nextCursor }) : null}
            />
          </>
        )}
      </section>
    </>
  );
}

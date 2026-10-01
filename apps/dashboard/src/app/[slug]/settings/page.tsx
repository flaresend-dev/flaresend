import * as React from "react";
import { getProjectOr404, type SlugParams } from "@/lib/project";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateSettingsAction } from "@/app/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/badge";
import { IdChip } from "@/components/ui/code";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { SwitchField } from "@/components/ui/switch";
import { Time } from "@/components/ui/time";
import { PauseSendingButton } from "@/components/settings/pause-sending";
import { MailerUrl } from "@/components/mailer-url";

export const metadata = { title: "Settings" };

/** One card = one form = one Save. `_fields` tells the action which fields this card owns. */
function SettingsCard({ slug, fields, title, description, children }: {
  slug: string;
  fields: string[];
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <ActionForm
        action={updateSettingsAction.bind(null, slug)}
        className="gap-0"
        statusClassName="mx-5 mb-4 w-auto"
        footer={
          <CardFooter>
            <SubmitButton>Save</SubmitButton>
          </CardFooter>
        }
      >
        <input type="hidden" name="_fields" value={fields.join(",")} />
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">{children}</CardContent>
      </ActionForm>
    </Card>
  );
}

/** `picker`: the project picker of the "All projects" view, shown under the header. */
export default async function SettingsPage({ params, picker }: SlugParams & { picker?: React.ReactNode }) {
  const { slug } = await params;
  const project = await getProjectOr404(slug);
  const paused = Boolean(project.disabledAt);

  return (
    <>
      <PageHeader title="Settings" />
      {picker}
      <div className="flex max-w-3xl flex-col gap-6">
        <SettingsCard slug={slug} fields={["name"]} title="General">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required defaultValue={project.name} className="max-w-sm" />
          </Field>
          <Field label="Slug" htmlFor="slug" description="Slugs are permanent.">
            <Input id="slug" readOnly value={project.slug} className="max-w-sm font-mono" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Project ID</span>
            <IdChip value={project.id} length={32} className="-ml-1.5 w-fit" />
          </div>
        </SettingsCard>

        <Card>
          <CardHeader>
            <CardTitle>Mailer</CardTitle>
            <CardDescription>
              Where apps send email over HTTP. Read from Cloudflare: the mailer Worker&apos;s custom domains first, then its
              workers.dev address, so a new domain shows up here without any config change.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Mailer URL</span>
            <MailerUrl className="-ml-0.5" />
          </CardContent>
        </Card>

        <SettingsCard slug={slug} fields={["dailyLimit"]} title="Limits">
          <Field
            label="Daily sending limit"
            htmlFor="dailyLimit"
            description={
              <>
                Emails per UTC day. 0 means no limit.
                {" "}Now: <span className="font-medium text-foreground">{project.dailyLimit ? num(project.dailyLimit) : "Unlimited"}</span>.
              </>
            }
          >
            <Input id="dailyLimit" name="dailyLimit" type="number" min={0} required defaultValue={project.dailyLimit} className="w-40 tabular-nums" />
          </Field>
        </SettingsCard>

        <SettingsCard
          slug={slug}
          fields={["trackOpens", "trackClicks"]}
          title="Tracking"
          description={
            <>
              Defaults for HTML emails. Each send can override with <code className="font-mono text-xs">trackOpens</code> /{" "}
              <code className="font-mono text-xs">trackClicks</code>.
            </>
          }
        >
          <SwitchField name="trackOpens" defaultChecked={project.trackOpens} label="Open tracking" description="Adds a 1×1 image to count opens." />
          <SwitchField name="trackClicks" defaultChecked={project.trackClicks} label="Click tracking" description="Rewrites links to count clicks." />
        </SettingsCard>

        <SettingsCard slug={slug} fields={["rpcEnabled"]} title="Access">
          <SwitchField
            name="rpcEnabled"
            defaultChecked={project.rpcEnabled}
            label="Allow Workers to send over RPC"
            description="Other Workers in your account can send for this project through the MailerRpc service binding, without an API key."
          />
        </SettingsCard>

        <Card className={cn("border-danger-border")}>
          <CardHeader>
            <CardTitle>{paused ? "Sending is paused" : "Danger zone"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {paused ? (
              <Notice tone="danger">
                Paused since <Time iso={project.disabledAt} format="absolute" />. Every send for this project is rejected.
              </Notice>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 max-w-md">
                <p className="text-sm font-medium">{paused ? "Resume sending" : "Pause sending"}</p>
                <p className="text-xs text-foreground-muted">
                  {paused ? "Sends are accepted again as soon as you resume." : "Every send for this project is rejected until you resume. Nothing is deleted."}
                </p>
              </div>
              <PauseSendingButton slug={slug} paused={paused} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

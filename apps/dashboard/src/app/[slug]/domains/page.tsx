import { Globe } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, type SearchParamsProp, type SlugParams } from "@/lib/project";
import { first } from "@/lib/email-query";
import { updateDomainsAction } from "@/app/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageError } from "@/components/page-error";
import { DomainsTable } from "@/components/domains/domains-table";
import { AddDomainButton } from "@/components/domains/add-domain";

export const metadata = { title: "Domains" };

export default async function DomainsPage({ params, searchParams }: SlugParams & SearchParamsProp) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const project = await getProjectOr404(slug);
  const domains = await mailerCall((m) => m.listDomains(slug, { refresh: first(sp.refresh) === "1" }));

  return (
    <>
      <PageHeader
        title="Domains"
        description="Emails can be sent from these domains. Verification status comes from Cloudflare Email Sending."
        actions={<AddDomainButton slug={slug} />}
      />
      {!domains.ok ? (
        <PageError error={domains.error} title="Could not load domains" />
      ) : domains.data.length ? (
        <DomainsTable slug={slug} domains={domains.data} domainSenders={project.domainSenders} />
      ) : (
        <EmptyState icon={<Globe />} title="Add a domain to start sending" action={<AddDomainButton slug={slug} />}>
          Onboard it in Cloudflare Email Sending too, then press Verify.
        </EmptyState>
      )}

      <Card className="mt-10">
        <ActionForm
          action={updateDomainsAction.bind(null, slug)}
          className="gap-0"
          statusClassName="mx-5 mb-4 w-auto"
          footer={
            <CardFooter>
              <SubmitButton>Save</SubmitButton>
            </CardFooter>
          }
        >
          <CardHeader>
            <CardTitle>Sending</CardTitle>
            <CardDescription>Which addresses this project may send from.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-x-8">
            <div className="md:pt-1.5">
              <p className="text-sm font-medium">Project default sender</p>
              <p className="text-xs text-foreground-muted">Used when a send has no from address. Set a sender for each domain from its menu above.</p>
            </div>
            <Field label={<span className="md:sr-only">Project default sender</span>} htmlFor="defaultFrom">
              <Input id="defaultFrom" name="defaultFrom" defaultValue={project.defaultFrom ?? ""} placeholder={`${project.name} <hello@${project.allowedDomains[0] ?? "example.com"}>`} />
            </Field>
            <div className="md:pt-1.5">
              <p className="text-sm font-medium">Allowed sender addresses</p>
              <p className="text-xs text-foreground-muted">Optional</p>
            </div>
            <Field
              label={<span className="md:sr-only">Allowed sender addresses</span>}
              htmlFor="allowedSenders"
              description="Comma separated. Leave empty to allow any address on a verified domain."
            >
              <Input id="allowedSenders" name="allowedSenders" defaultValue={(project.allowedSenders ?? []).join(", ")} placeholder={`hello@${project.allowedDomains[0] ?? "example.com"}`} className="font-mono" />
            </Field>
          </CardContent>
        </ActionForm>
      </Card>
    </>
  );
}

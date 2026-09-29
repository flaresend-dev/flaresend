import { Globe } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, type SearchParamsProp, type SlugParams } from "@/lib/project";
import { first } from "@/lib/email-query";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError } from "@/components/page-error";
import { DomainsTable } from "@/components/domains/domains-table";
import { AddDomainButton } from "@/components/domains/add-domain";
import { SendingCard } from "@/components/domains/sending-card";

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

      <SendingCard projects={[project]} />
    </>
  );
}

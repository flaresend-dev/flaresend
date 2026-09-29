import { Globe } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { listProjects, type SearchParamsProp } from "@/lib/project";
import { first } from "@/lib/email-query";
import { ALL } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError } from "@/components/page-error";
import { VerifyButton } from "@/components/domains/domains-table";
import { AllDomainsTable } from "@/components/domains/all-domains-table";
import { AddDomainButton } from "@/components/domains/add-domain";
import { SendingCard } from "@/components/domains/sending-card";

export const metadata = { title: "Domains" };

/** Every project's domains, one row per domain. Adding a domain asks for the project. */
export default async function AllDomainsPage({ searchParams }: SearchParamsProp) {
  const sp = await searchParams;
  const [domains, projects] = await Promise.all([
    mailerCall((m) => m.listAllDomains({ refresh: first(sp.refresh) === "1" })),
    listProjects(),
  ]);
  const list = projects.ok ? projects.data : [];
  const add = list.length ? <AddDomainButton slug={ALL} projects={list} /> : null;

  return (
    <>
      <PageHeader
        title="Domains"
        description="Every domain of every project. Verification status comes from Cloudflare Email Sending."
        actions={
          <>
            {domains.ok && domains.data.length ? <VerifyButton size="md" /> : null}
            {add}
          </>
        }
      />
      {!domains.ok ? (
        <PageError error={domains.error} title="Could not load domains" />
      ) : domains.data.length ? (
        <AllDomainsTable domains={domains.data} projects={list} />
      ) : (
        <EmptyState icon={<Globe />} title="Add a domain to start sending" action={add}>
          Onboard it in Cloudflare Email Sending too, then press Verify.
        </EmptyState>
      )}

      {list.length ? <SendingCard projects={list} /> : null}
    </>
  );
}

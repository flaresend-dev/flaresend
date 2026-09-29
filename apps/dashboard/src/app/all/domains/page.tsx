import { Globe } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import type { SearchParamsProp } from "@/lib/project";
import { first } from "@/lib/email-query";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError } from "@/components/page-error";
import { VerifyButton } from "@/components/domains/domains-table";
import { AllDomainsTable } from "@/components/domains/all-domains-table";

export const metadata = { title: "Domains" };

export default async function AllDomainsPage({ searchParams }: SearchParamsProp) {
  const sp = await searchParams;
  const domains = await mailerCall((m) => m.listAllDomains({ refresh: first(sp.refresh) === "1" }));

  return (
    <>
      <PageHeader
        title="Domains"
        description="Every domain of every project. To add, set up or remove a domain, open it and pick a project."
        actions={domains.ok && domains.data.length ? <VerifyButton size="md" /> : null}
      />
      {!domains.ok ? (
        <PageError error={domains.error} title="Could not load domains" />
      ) : domains.data.length ? (
        <AllDomainsTable domains={domains.data} />
      ) : (
        <EmptyState icon={<Globe />} title="No domains yet">
          Add a domain from a project&apos;s Domains page.
        </EmptyState>
      )}
    </>
  );
}

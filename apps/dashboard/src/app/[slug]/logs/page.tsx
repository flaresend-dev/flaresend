import { mailerCall } from "@/lib/mailer";
import type { SearchParamsProp, SlugParams } from "@/lib/project";
import { first } from "@/lib/email-query";
import { ALL } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { PageError } from "@/components/page-error";
import { LogStream } from "@/components/log-stream";

export const metadata = { title: "Logs" };

export default async function LogsPage({ params, searchParams }: SlugParams & SearchParamsProp) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const type = first(sp.type);
  const emailId = first(sp.emailId);
  const initial = await mailerCall((m) =>
    m.listEvents({ limit: 100, ...(slug === ALL ? {} : { project: slug }), ...(type ? { type } : {}), ...(emailId ? { emailId } : {}) }),
  );
  return (
    <>
      <PageHeader title="Logs" description={`Every email event for ${slug === ALL ? "every project" : "this project"}, newest first.`} />
      {!initial.ok ? (
        <div className="mb-4">
          <PageError error={initial.error} title="Could not load events" />
        </div>
      ) : null}
      <LogStream
        key={`${type}|${emailId}`}
        slug={slug}
        type={type}
        emailId={emailId}
        initial={initial.ok ? initial.data : { data: [], nextCursor: null }}
      />
    </>
  );
}

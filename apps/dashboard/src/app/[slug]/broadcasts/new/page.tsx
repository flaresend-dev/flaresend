import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, linker, type SlugParams } from "@/lib/project";
import { PageHeader } from "@/components/ui/page-header";
import { PageError } from "@/components/page-error";
import { BroadcastComposer } from "@/components/broadcast-composer";
import { BroadcastNotices } from "@/components/broadcasts/notices";

export const metadata = { title: "New broadcast" };

export default async function NewBroadcastPage({ params }: SlugParams) {
  const { slug, view } = await params;
  const to = linker(slug, view);
  const project = await getProjectOr404(slug);
  const [audiences, templates] = await Promise.all([mailerCall((m) => m.listAudiences(slug)), mailerCall((m) => m.listTemplates(slug))]);
  const editable = templates.ok ? templates.data.filter((t) => t.source === "db" && t.html) : [];
  return (
    <>
      <PageHeader title="New broadcast" back={{ href: to("broadcasts"), label: "Broadcasts" }} />
      {!project.broadcastsEnabled ? <BroadcastNotices slug={slug} view={view} enabled={false} /> : null}
      {audiences.ok ? (
        <BroadcastComposer slug={slug} broadcast={null} audiences={audiences.data} defaultFrom={project.defaultFrom ?? ""} templates={editable} />
      ) : (
        <PageError error={audiences.error} title="Could not load audiences" />
      )}
    </>
  );
}

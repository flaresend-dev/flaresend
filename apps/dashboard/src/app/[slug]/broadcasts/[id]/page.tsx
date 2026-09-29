import { notFound } from "next/navigation";
import Link from "next/link";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, linker } from "@/lib/project";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailList } from "@/components/ui/sheet";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { HtmlFrame } from "@/components/content-viewer";
import { BroadcastComposer } from "@/components/broadcast-composer";
import { BroadcastLive } from "@/components/broadcasts/broadcast-live";
import { BroadcastActions } from "@/components/broadcasts/broadcast-actions";
import { BroadcastNotices } from "@/components/broadcasts/notices";

export const metadata = { title: "Broadcast" };

export default async function BroadcastPage({ params }: { params: Promise<{ slug: string; id: string; view?: string }> }) {
  const { slug, id, view } = await params;
  const to = linker(slug, view);
  const project = await getProjectOr404(slug);
  const back = { href: to("broadcasts"), label: "Broadcasts" };
  const [r, audiences] = await Promise.all([mailerCall((m) => m.getBroadcast(slug, id)), mailerCall((m) => m.listAudiences(slug))]);
  if (!r.ok) {
    if (r.error.code.includes("not_found")) notFound();
    return (
      <>
        <PageHeader title="Broadcast" back={back} />
        <PageError error={r.error} title="Could not load this broadcast" />
      </>
    );
  }
  const b = r.data;
  const audienceList = audiences.ok ? audiences.data : [];
  const audience = audienceList.find((a) => a.id === b.audienceId);

  // Drafts open in the composer.
  if (b.status === "draft") {
    const templates = await mailerCall((m) => m.listTemplates(slug));
    const editable = templates.ok ? templates.data.filter((t) => t.source === "db" && t.html) : [];
    return (
      <>
        <PageHeader
          back={back}
          title={b.subject || "Untitled broadcast"}
          description={<StatusBadge status="draft" />}
          actions={<BroadcastActions slug={slug} id={b.id} cancelable={false} deletable />}
        />
        {!project.broadcastsEnabled ? <BroadcastNotices slug={slug} view={view} enabled={false} /> : null}
        <BroadcastComposer key={b.updatedAt} slug={slug} broadcast={b} audiences={audienceList} defaultFrom={project.defaultFrom ?? ""} templates={editable} />
      </>
    );
  }

  const from = b.fromName ? `${b.fromName} <${b.from}>` : b.from;
  return (
    <>
      <PageHeader
        back={back}
        title={b.subject}
        description={<StatusBadge status={b.status} />}
        actions={
          <BroadcastActions
            slug={slug}
            id={b.id}
            cancelable={b.status === "scheduled" || b.status === "sending"}
            deletable={b.status === "canceled" || b.status === "sent"}
          />
        }
      />
      <BroadcastLive slug={slug} initial={b} />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardContent className="pt-5">
            <DetailList
              items={[
                ["From", <span key="f" className="break-all">{from}</span>],
                [
                  "Audience",
                  audience ? (
                    <Link key="a" href={to("audiences", audience.id)} className="underline-offset-2 hover:underline">
                      {audience.name}
                    </Link>
                  ) : (
                    "Deleted audience"
                  ),
                ],
                b.scheduledAt ? ["Scheduled", <Time key="s" iso={b.scheduledAt} format="absolute" />] : null,
                b.startedAt ? ["Started", <Time key="st" iso={b.startedAt} format="absolute" />] : null,
                b.completedAt ? ["Completed", <Time key="c" iso={b.completedAt} format="absolute" />] : null,
                ["Created", <Time key="cr" iso={b.createdAt} format="absolute" />],
              ]}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Content</CardTitle>
          </CardHeader>
          <CardContent>
            <HtmlFrame title="Broadcast content" html={b.html} className="h-[520px]" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

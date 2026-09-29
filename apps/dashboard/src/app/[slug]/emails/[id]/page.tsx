import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CircleAlert } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404 } from "@/lib/project";
import { bytes, ms } from "@/lib/format";
import { ALL, p } from "@/lib/nav";
import { titleCase } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Notice, StatusBadge } from "@/components/ui/badge";
import { IdChip } from "@/components/ui/code";
import { DetailList } from "@/components/ui/sheet";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { Tooltip } from "@/components/ui/tooltip";
import { PageError } from "@/components/page-error";
import { ContentViewer } from "@/components/content-viewer";
import { EmailActions, ScheduledActions } from "@/components/emails/email-actions";
import { EventTimeline } from "@/components/emails/event-timeline";

export const metadata = { title: "Email" };

const KIND = { to: "To", cc: "Cc", bcc: "Bcc" } as const;

/** Also rendered at `/all/emails/{id}` (slug = ALL), where any project's email opens and the Project row says whose it is. */
export default async function EmailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const isAll = slug === ALL;
  const project = isAll ? null : await getProjectOr404(slug);
  const back = { href: p(slug, "emails"), label: "Emails" };
  const [email, content, projects] = await Promise.all([
    mailerCall((m) => m.getEmail(id)),
    mailerCall((m) => m.getContent(id)),
    isAll ? mailerCall((m) => m.listProjects()) : null,
  ]);

  if (!email.ok) {
    return (
      <>
        <PageHeader title="Email" back={back} />
        <PageError error={email.error} title="Could not load this email" />
      </>
    );
  }
  const e = email.data;
  // An id from another project: let the global redirector find the right one.
  if (project && e.projectId !== project.id) redirect(`/emails/${encodeURIComponent(id)}`);
  const owner = projects?.ok ? projects.data.find((x) => x.id === e.projectId) : undefined;

  const from = e.fromName ? `${e.fromName} <${e.from}>` : e.from;
  const recipientCount = e.recipients.length;
  const showRecipients = recipientCount > 1 || e.recipients.some((r) => r.smtpStatus || r.smtpResponse);
  const tags = Object.entries(e.tags ?? {});
  const list = (a: string[]) => <span className="break-all">{a.join(", ")}</span>;

  return (
    <>
      <PageHeader
        back={back}
        title={e.subject || <span className="text-foreground-muted">(no subject)</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={e.status} />
            {e.mode === "test" ? (
              <Tooltip content="Sent with a test key: recorded, never delivered.">
                <span>
                  <Badge>Test</Badge>
                </span>
              </Tooltip>
            ) : null}
            <span className="text-foreground-subtle" aria-hidden>
              ·
            </span>
            <IdChip value={e.id} length={16} />
          </span>
        }
        actions={<EmailActions slug={slug} id={e.id} scheduled={e.status === "scheduled"} scheduledAt={e.scheduledAt} />}
      />

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {e.status === "scheduled" ? (
          <Notice tone="violet" icon={<CalendarClock />} actions={<ScheduledActions slug={slug} id={e.id} scheduledAt={e.scheduledAt} />}>
            <span className="font-medium text-foreground">
              Scheduled for <Time iso={e.scheduledAt} format="absolute" /> (<Time iso={e.scheduledAt} />)
            </span>
          </Notice>
        ) : null}
        {e.lastError ? (
          <Notice tone="danger" icon={<CircleAlert />} title={<>Last error: <code>{e.lastError.code}</code></>}>
            {e.lastError.message}
          </Notice>
        ) : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 overflow-hidden">
          {content.ok ? <ContentViewer content={content.data} /> : <div className="p-4"><PageError error={content.error} title="Could not load the content" /></div>}
        </Card>

        <div className="flex flex-col gap-6 lg:sticky lg:top-6">
          <Card>
            <CardContent className="pt-5">
              <DetailList
                items={[
                  isAll
                    ? [
                        "Project",
                        owner ? (
                          <Link key="p" href={p(owner.slug, "emails", e.id)} className="underline-offset-2 hover:underline">
                            {owner.name}
                            {owner.disabledAt ? <span className="text-foreground-subtle"> (paused)</span> : null}
                          </Link>
                        ) : (
                          <span key="p" className="font-mono text-xs">{e.projectId}</span>
                        ),
                      ]
                    : null,
                  ["From", <span key="f" className="break-all">{from}</span>],
                  ["To", list(e.to)],
                  e.cc.length > 0 && ["Cc", list(e.cc)],
                  e.bcc.length > 0 && ["Bcc", list(e.bcc)],
                  e.replyTo ? ["Reply-To", <span key="r" className="break-all">{e.replyTo}</span>] : null,
                  ["Sent", <Time key="s" iso={e.sentAt ?? e.createdAt} format="absolute" />],
                  e.deliveredAt ? ["Delivered", <Time key="d" iso={e.deliveredAt} format="absolute" />] : null,
                  e.failedAt ? ["Failed", <Time key="x" iso={e.failedAt} format="absolute" />] : null,
                  e.template
                    ? ["Template", <span key="t" className="font-mono text-xs">{e.template}{e.templateVersion !== null ? ` v${e.templateVersion}` : ""}</span>]
                    : null,
                  tags.length > 0 && [
                    "Tags",
                    <span key="g" className="flex flex-wrap gap-1">
                      {tags.map(([k, v]) => (
                        <Badge key={k} mono>
                          {k}:{v}
                        </Badge>
                      ))}
                    </span>,
                  ],
                  ["Tracking", `Opens ${e.trackOpens ? "on" : "off"} · Clicks ${e.trackClicks ? "on" : "off"}`],
                  e.openedAt ? ["Opened", <Time key="o" iso={e.openedAt} format="absolute" />] : null,
                  e.firstClickedAt ? ["First click", <Time key="c" iso={e.firstClickedAt} format="absolute" />] : null,
                  ["Size", `${bytes(e.sizeBytes)} · ${e.attachmentCount} ${e.attachmentCount === 1 ? "attachment" : "attachments"}`],
                  ["Attempts", String(e.attempts)],
                  e.cloudflareMessageId ? ["Message ID", <IdChip key="m" value={e.cloudflareMessageId} className="-ml-1.5" />] : null,
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Events</CardTitle>
            </CardHeader>
            <CardContent>
              <EventTimeline events={e.events} showRecipient={recipientCount > 1} />
            </CardContent>
          </Card>
        </div>
      </div>

      {showRecipients ? (
        <section className="mt-8">
          <h2 className="mb-3 text-section font-semibold">
            Recipients <span className="text-foreground-subtle tabular-nums">{recipientCount}</span>
          </h2>
          <Table>
            <THead>
              <tr>
                <TH className="w-[26%]">Address</TH>
                <TH className="w-[70px]">Kind</TH>
                <TH className="w-[150px]">Status</TH>
                <TH>Response</TH>
                <TH className="hidden w-[110px] md:table-cell">Bounce</TH>
                <TH className="hidden w-[90px] text-right md:table-cell">Delivery</TH>
                <TH className="w-[100px] text-right">Last event</TH>
              </tr>
            </THead>
            <TBody>
              {e.recipients.map((r) => {
                const resp = r.smtpResponse ? (r.smtpStatus && !r.smtpResponse.startsWith(r.smtpStatus) ? `${r.smtpStatus} ${r.smtpResponse}` : r.smtpResponse) : (r.smtpStatus ?? "");
                return (
                  <tr key={`${r.kind}-${r.address}`}>
                    <TD className="truncate font-mono text-xs">{r.address}</TD>
                    <TD className="text-foreground-muted">{KIND[r.kind]}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="truncate text-xs">
                      {resp ? (
                        <Tooltip content={<span className="font-mono break-all">{resp}</span>}>
                          <span className="font-mono">{resp}</span>
                        </Tooltip>
                      ) : (
                        <span className="text-foreground-subtle">—</span>
                      )}
                    </TD>
                    <TD className="hidden text-foreground-muted md:table-cell">{r.bounceType ? titleCase(r.bounceType) : "—"}</TD>
                    <TD className="hidden text-right tabular-nums text-foreground-muted md:table-cell">{r.deliveryMs !== null ? ms(r.deliveryMs) : "—"}</TD>
                    <TD className="text-right text-foreground-muted">
                      <Time iso={r.lastEventAt} />
                    </TD>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </section>
      ) : null}
    </>
  );
}

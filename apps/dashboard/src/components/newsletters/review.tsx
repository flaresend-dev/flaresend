"use client";
// Review and send: choose the website, email, or both; who gets it; when. Only technical problems block.
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CircleAlert, CircleCheck, CircleX, Globe, Mail, Send, TriangleAlert } from "lucide-react";
import type {
  NewsletterReview, NewsletterReviewCheck, NewsletterSubscriptionRecord, NewsletterTag, PublicationRecord,
} from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { Button, LinkButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/tabs";
import { Notice } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fieldClass } from "@/components/ui/input";
import { Time } from "@/components/ui/time";
import { toastError, toastSuccess } from "@/components/ui/toast";
import { EmailServiceNote } from "@/components/email-service-note";
import { newsletterScheduleUtc } from "@/lib/newsletter-time";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PreviewFrame, SendTestButton } from "./preview";
import { TimezoneSelect, utcOffset } from "./timezone-select";

const FIX_PATH: Record<NonNullable<NewsletterReviewCheck["fix"]>, string> = {
  editor: "",
  settings: "/settings#sender",
  website: "/website",
  subscribers: "/subscribers",
};
const FIX_LABEL: Record<NonNullable<NewsletterReviewCheck["fix"]>, string> = {
  editor: "Edit post",
  settings: "Open settings",
  website: "Website settings",
  subscribers: "Add subscribers",
};

function localParts(zone: string, at: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function PostReview({
  slug, initial, publication, tags, subscribers,
}: {
  slug: string;
  initial: NewsletterReview;
  publication: PublicationRecord;
  tags: NewsletterTag[];
  subscribers: NewsletterSubscriptionRecord[];
}) {
  const router = useRouter();
  const [review, setReview] = useState(initial);
  const post = review.post;
  const caps = review.capabilities;
  const base = `/${slug}/newsletters/${publication.id}`;
  const editorHref = `${base}/posts/${post.id}`;
  const onWebsite = !!post.publicRevisionId;
  const webChanged = onWebsite && post.publicRevisionId !== post.draftRevisionId;
  const webReady = review.checks.find((c) => c.id === "website")?.ok ?? false;

  const [web, setWeb] = useState(webReady && (!onWebsite || webChanged) && post.webStatus !== "scheduled");
  const [email, setEmail] = useState(caps.email && !review.lastRun);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [counting, startCount] = useTransition();
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [zone, setZone] = useState(publication.timezone || "UTC");
  const tomorrow = useMemo(() => localParts(publication.timezone || "UTC", new Date(Date.now() + 86_400_000)), [publication.timezone]);
  const [date, setDate] = useState(tomorrow.date);
  const [time, setTime] = useState("09:00");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState<string | null>(null);
  const webKey = useRef(crypto.randomUUID());
  const emailKey = useRef(crypto.randomUUID());

  let scheduledAt: string | undefined;
  let scheduleError = "";
  if (when === "schedule") {
    try {
      scheduledAt = newsletterScheduleUtc(`${date}T${time}`, zone);
      if (Date.parse(scheduledAt) <= Date.now() + 60_000) scheduleError = "Choose a time in the future.";
    } catch (e) {
      scheduleError = (e as Error).message;
    }
  }
  const scheduledLabel = scheduledAt
    ? new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(scheduledAt))
    : "";

  const relevant = review.checks.filter(
    (c) => c.channel === "both" ? web || email : c.channel === "web" ? web : email,
  );
  const blockers = relevant.filter((c) => !c.ok && c.level === "error");
  const blocked = (!web && !email) || blockers.length > 0 || !!scheduleError;

  const count = review.eligible;
  const label = !web && !email
    ? "Choose where this post goes"
    : when === "schedule"
      ? web
        ? `Schedule for ${scheduledLabel || "…"}`
        : `Schedule email for ${scheduledLabel || "…"}`
      : web && email
        ? `Publish and send to ${num(count)} ${count === 1 ? "subscriber" : "subscribers"}`
        : web
          ? webChanged
            ? "Update the website"
            : "Publish on the website"
          : `Send to ${num(count)} ${count === 1 ? "subscriber" : "subscribers"}`;

  const recount = (next: string[]) => {
    setSelectedTags(next);
    emailKey.current = crypto.randomUUID();
    startCount(async () => {
      const r = await newsletterAction(slug, "reviewNewsletterPost", publication.id, post.id, next.length ? { tags: next } : {});
      if (r.ok) setReview(r.data);
      else toastError(r.error.message);
    });
  };

  async function sendEmail(expectedRevision: number) {
    return newsletterAction(slug, "sendNewsletterEmail", publication.id, post.id, {
      expectedRevision,
      revisionId: post.draftRevisionId,
      filter: selectedTags.length ? { tags: selectedTags } : {},
      ...(scheduledAt ? { scheduledAt, timezone: zone } : {}),
      idempotencyKey: emailKey.current,
    });
  }

  async function go() {
    setBusy(true);
    setPartial(null);
    let revision = post.revision;
    if (web) {
      const r = await newsletterAction(slug, "publishNewsletterWeb", publication.id, post.id, {
        expectedRevision: post.revision,
        revisionId: post.draftRevisionId,
        ...(scheduledAt ? { scheduledAt, timezone: zone } : {}),
        idempotencyKey: webKey.current,
      });
      if (!r.ok) {
        setBusy(false);
        toastError(r.error.message);
        return;
      }
      revision = r.data.revision;
    }
    if (email) {
      const r = await sendEmail(revision);
      if (!r.ok) {
        setBusy(false);
        if (web) setPartial(r.error.message);
        else toastError(r.error.message);
        return;
      }
    }
    toastSuccess(
      when === "schedule"
        ? `Scheduled for ${scheduledLabel}.`
        : email
          ? web
            ? "Published. The email is on its way."
            : "The email is on its way."
          : "Published on the website.",
    );
    router.push(`${base}/posts/${post.id}/report`);
    router.refresh();
  }

  const submit = () => {
    if (blocked) return;
    if (email && when === "now") setConfirm(true);
    else void go();
  };

  return (
    <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        {partial ? (
          <Notice
            tone="danger"
            icon={<CircleAlert />}
            className="mb-5"
            title="The website part is done. The email was not sent."
            actions={
              <Button
                size="sm"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await sendEmail(post.revision + 1);
                  setBusy(false);
                  if (!r.ok) return setPartial(r.error.message);
                  router.push(`${base}/posts/${post.id}/report`);
                }}
              >
                Try the email again
              </Button>
            }
          >
            {partial}
          </Notice>
        ) : null}

        <Section title="Where it goes" first>
          <ChannelRow
            icon={<Globe />}
            label={webChanged ? "Update the website version" : onWebsite ? "Already on the website" : "Publish on the website"}
            checked={web}
            disabled={!webReady || (onWebsite && !webChanged) || post.webStatus === "scheduled"}
            onChange={(v) => {
              setWeb(v);
              webKey.current = crypto.randomUUID();
            }}
            detail={
              webReady ? (
                <span className="truncate font-mono text-xs">{post.publicUrl.replace(/^https?:\/\//, "")}</span>
              ) : (
                <>
                  The website is off. <Link href={`${base}/website`} className="font-medium text-foreground underline-offset-2 hover:underline">Turn it on</Link>
                </>
              )
            }
          />
          <ChannelRow
            icon={<Mail />}
            label="Send by email"
            checked={email}
            disabled={!caps.email}
            onChange={(v) => {
              setEmail(v);
              emailKey.current = crypto.randomUUID();
            }}
            detail={
              caps.email ? (
                <>
                  From {review.sender.fromName} &lt;{review.sender.fromAddress}&gt;
                  {review.lastRun ? (
                    <span className="block">
                      Emailed to {num(review.lastRun.total)} subscribers <Time iso={review.lastRun.createdAt} format="date" />.
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  {review.checks.find((c) => c.id === "sender")?.message}{" "}
                  <Link href={`${base}/settings#sender`} className="font-medium text-foreground underline-offset-2 hover:underline">Fix it</Link>
                </>
              )
            }
            action={<SendTestButton slug={slug} post={post} size="sm" disabledReason={caps.email ? null : "Set up a sender first."} />}
          />
          <EmailServiceNote className="mt-1 pl-[46px]" />
        </Section>

        {email ? (
          <Section
            title="Who gets the email"
            aside={
              <span className={cn("font-semibold tabular-nums", counting && "opacity-50")}>
                {num(count)} {count === 1 ? "subscriber" : "subscribers"}
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" disabled={!tags.length}>
                    {selectedTags.length
                      ? `Tagged ${selectedTags.map((t) => tags.find((x) => x.id === t)?.name ?? t).join(" or ")}`
                      : "All subscribers"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  <DropdownMenuLabel>Only subscribers tagged</DropdownMenuLabel>
                  {tags.map((t) => (
                    <DropdownMenuCheckItem
                      key={t.id}
                      checked={selectedTags.includes(t.id)}
                      onSelect={(e) => {
                        e.preventDefault();
                        recount(selectedTags.includes(t.id) ? selectedTags.filter((x) => x !== t.id) : [...selectedTags, t.id]);
                      }}
                    >
                      {t.name}
                    </DropdownMenuCheckItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {selectedTags.length ? (
                <Button size="sm" variant="ghost" onClick={() => recount([])}>
                  Everyone
                </Button>
              ) : null}
              {!tags.length ? <span className="text-xs text-foreground-muted">Add tags on the Subscribers tab to send to part of the list.</span> : null}
            </div>
            <p className="mt-2 text-xs text-foreground-muted">
              Not included: {num(review.excluded.pending)} waiting to confirm, {num(review.excluded.unsubscribed)} unsubscribed,{" "}
              {num(review.excluded.suppressed)} suppressed.
            </p>
          </Section>
        ) : null}

        <Section title="When">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="When"
              value={when}
              onChange={(v) => {
                setWhen(v);
                webKey.current = crypto.randomUUID();
                emailKey.current = crypto.randomUUID();
              }}
              options={[
                { value: "now", label: "Now" },
                { value: "schedule", label: "Schedule" },
              ]}
            />
            {when === "schedule" ? (
              <>
                <input
                  type="date"
                  aria-label="Date"
                  value={date}
                  min={localParts(zone, new Date()).date}
                  onChange={(e) => setDate(e.target.value)}
                  className={cn(fieldClass, "h-8 w-auto px-2.5")}
                />
                <input
                  type="time"
                  aria-label="Time"
                  value={time}
                  step={300}
                  onChange={(e) => setTime(e.target.value)}
                  className={cn(fieldClass, "h-8 w-auto px-2.5")}
                />
              </>
            ) : null}
          </div>
          {when === "schedule" ? (
            <p className={cn("mt-2 text-xs", scheduleError ? "text-danger-fg" : "text-foreground-muted")} role={scheduleError ? "alert" : undefined}>
              {scheduleError || (
                <>
                  {zone.replace(/_/g, " ")} time ({utcOffset(zone)})
                  {scheduledAt ? <>, which is {new Date(scheduledAt).toISOString().slice(11, 16)} UTC</> : null}.{" "}
                  <TimezoneSelect
                    value={zone}
                    onChange={setZone}
                    trigger={<button type="button" className="font-medium text-foreground underline-offset-2 hover:underline">Change timezone</button>}
                  />
                  {web && email ? " The website and the email go out together." : null}
                </>
              )}
            </p>
          ) : null}
        </Section>

        <Section title="Checks">
          <ul className="flex flex-col">
            {relevant.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2.5 py-1.5">
                {c.ok ? (
                  <CircleCheck className="size-4 shrink-0 text-success-fg" aria-label="Passed" />
                ) : c.level === "error" ? (
                  <CircleX className="size-4 shrink-0 text-danger-fg" aria-label="Blocks sending" />
                ) : (
                  <TriangleAlert className="size-4 shrink-0 text-warning-fg" aria-label="Warning" />
                )}
                <span className="min-w-0 flex-1 text-sm">
                  {c.label}
                  {!c.ok && c.message ? <span className="text-foreground-muted"> · {c.message}</span> : null}
                </span>
                {!c.ok && c.fix ? (
                  <LinkButton size="sm" href={c.fix === "editor" ? editorHref : `${base}${FIX_PATH[c.fix]}`}>
                    {FIX_LABEL[c.fix]}
                  </LinkButton>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <span className="text-xs text-foreground-muted">
            {email && when === "now"
              ? "An email cannot be unsent. Send yourself a test first."
              : when === "schedule"
                ? "You can cancel a schedule until it starts."
                : " "}
          </span>
          <Button variant="primary" size="lg" disabled={blocked} loading={busy} onClick={submit}>
            {when === "schedule" ? <CalendarClock /> : email ? <Send /> : <Globe />}
            {label}
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-8">
        <PreviewFrame slug={slug} post={post} subscribers={subscribers} compact height="560px" />
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Send to ${num(count)} ${count === 1 ? "subscriber" : "subscribers"}?`}
        body={`An email cannot be unsent.${web ? " The post is also published on the website." : ""}`}
        confirmLabel="Send now"
        successMessage=""
        onConfirm={() => {
          void go();
        }}
      />
    </div>
  );
}

function Section({ title, aside, first, children }: { title: string; aside?: React.ReactNode; first?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("py-5", first ? "pt-0" : "border-t border-border")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-section font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ChannelRow({
  icon, label, detail, checked, disabled, onChange, action,
}: {
  icon: React.ReactNode;
  label: string;
  detail: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  action?: React.ReactNode;
}) {
  const id = `ch-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Switch id={id} checked={checked && !disabled} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cn("flex items-center gap-2 font-medium [&_svg]:size-4 [&_svg]:text-foreground-muted", disabled && "text-foreground-muted")}>
          {icon}
          {label}
        </label>
        <div className="mt-0.5 min-w-0 text-xs text-foreground-muted">{detail}</div>
      </div>
      {action}
    </div>
  );
}

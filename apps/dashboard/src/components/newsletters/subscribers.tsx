"use client";
// Subscribers: export, import (CSV or audience), tags, and one subscriber's record.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Link2, Tags, Trash2, Upload, X } from "lucide-react";
import type {
  AudienceRecord, NewsletterFilter, NewsletterImportMapping, NewsletterImportPreview, NewsletterImportRecord,
  NewsletterSubscriptionRecord, NewsletterTag,
} from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Sheet, DetailList } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, MoreButton } from "@/components/ui/dropdown-menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { toastError, toastSuccess } from "@/components/ui/toast";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

function download(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export, Import and the tag menu, at the top right of the Subscribers tab. */
export function SubscriberActions({
  slug, id, filter, tags, audiences, signupUrl,
}: {
  slug: string;
  id: string;
  filter: NewsletterFilter;
  tags: NewsletterTag[];
  audiences: AudienceRecord[];
  signupUrl: string | null;
}) {
  const [busy, start] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("import") === "1") setImportOpen(true);
  }, []);
  return (
    <div className="flex items-center gap-2">
      {signupUrl ? (
        <Button
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(signupUrl);
            toastSuccess("Sign-up link copied.");
          }}
        >
          <Link2 /> Copy sign-up link
        </Button>
      ) : null}
      <Button
        loading={busy}
        onClick={() =>
          start(async () => {
            const r = await newsletterAction(slug, "exportNewsletterSubscribers", id, filter);
            if (r.ok) download(r.data.csv, "subscribers.csv");
            else toastError(r.error.message);
          })
        }
      >
        {busy ? null : <Download />} Export
      </Button>
      <Button variant="primary" onClick={() => setImportOpen(true)}>
        <Upload /> Import
      </Button>
      <DropdownMenu>
        <MoreButton label="More subscriber actions" />
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setTagsOpen(true)}>
            <Tags /> Manage tags
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} slug={slug} id={id} audiences={audiences} />
      <TagsDialog open={tagsOpen} onOpenChange={setTagsOpen} slug={slug} id={id} tags={tags} />
    </div>
  );
}

function TagsDialog({
  open, onOpenChange, slug, id, tags,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slug: string;
  id: string;
  tags: NewsletterTag[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>Group subscribers, then send an email to one or more tags.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              start(async () => {
                const r = await newsletterAction(slug, "createNewsletterTag", id, name.trim());
                if (!r.ok) return toastError(r.error.message);
                setName("");
                router.refresh();
              });
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="New tag" aria-label="New tag name" />
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Add
            </Button>
          </form>
          {tags.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span className="truncate">{t.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove tag ${t.name}`}
                    onClick={() =>
                      start(async () => {
                        const r = await newsletterAction(slug, "deleteNewsletterTag", id, t.id);
                        if (!r.ok) return toastError(r.error.message);
                        router.refresh();
                      })
                    }
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground-muted">No tags yet.</p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const MAP_FIELDS: Array<[keyof NewsletterImportMapping, string]> = [
  ["email", "Email"],
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["tags", "Tags"],
  ["source", "Source"],
];
const SKIP = "__skip";

function guess(headers: string[], field: keyof NewsletterImportMapping) {
  const words: Record<string, RegExp> = {
    email: /e-?mail/i,
    firstName: /^(first|given|first.?name|fname)$/i,
    lastName: /^(last|surname|family|last.?name|lname)$/i,
    tags: /tags?/i,
    source: /source/i,
  };
  return headers.find((h) => words[field]!.test(h.trim()));
}

function ImportSheet({
  open, onOpenChange, slug, id, audiences,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slug: string;
  id: string;
  audiences: AudienceRecord[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [audience, setAudience] = useState("");
  const [preview, setPreview] = useState<NewsletterImportPreview | null>(null);
  const [mapping, setMapping] = useState<NewsletterImportMapping>({ email: "email" });
  const [source, setSource] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ack, setAck] = useState(false);
  const [job, setJob] = useState<NewsletterImportRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const [drag, setDrag] = useState(false);
  const key = useRef(crypto.randomUUID());
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1);
    setFile(null);
    setAudience("");
    setPreview(null);
    setMapping({ email: "email" });
    setSource("");
    setAck(false);
    setJob(null);
    setError("");
    key.current = crypto.randomUUID();
  };

  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    const t = setTimeout(async () => {
      const r = await newsletterAction(slug, "getNewsletterImport", id, job.id);
      if (r.ok) {
        setJob(r.data);
        if (r.data.status === "completed") router.refresh();
      } else setError(r.error.message);
    }, 1500);
    return () => clearTimeout(t);
  }, [job, slug, id, router]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setError("");
    if (f.size > 5 * 1024 * 1024) return setError("Use a file below 5 MB.");
    setFile(f);
    setAudience("");
    start(async () => {
      const r = await newsletterAction(slug, "previewNewsletterImport", id, { csv: await f.text() });
      if (!r.ok) return setError(r.error.message);
      const headers = r.data.headers;
      const m: NewsletterImportMapping = { email: guess(headers, "email") ?? headers[0] ?? "email" };
      for (const [field] of MAP_FIELDS.slice(1)) {
        const g = guess(headers, field);
        if (g) (m as unknown as Record<string, string>)[field] = g;
      }
      setMapping(m);
      const again = await newsletterAction(slug, "previewNewsletterImport", id, { csv: "", fileId: r.data.fileId, mapping: m });
      setPreview(again.ok ? again.data : r.data);
      setStep(2);
    });
  };

  const remap = (next: NewsletterImportMapping) => {
    setMapping(next);
    key.current = crypto.randomUUID();
    if (!preview) return;
    start(async () => {
      const r = await newsletterAction(slug, "previewNewsletterImport", id, { csv: "", fileId: preview.fileId, mapping: next });
      if (r.ok) setPreview(r.data);
      else setError(r.error.message);
    });
  };

  const consent = () => ({ source: source.trim(), at: new Date(`${date}T12:00:00`).toISOString() });
  const canImport = !!source.trim() && !!date && ack;
  const run = () =>
    start(async () => {
      setError("");
      const r = audience
        ? await newsletterAction(slug, "importNewsletterAudience", id, { audienceId: audience, consent: consent(), idempotencyKey: key.current })
        : await newsletterAction(slug, "startNewsletterImport", id, {
            fileId: preview!.fileId,
            mapping,
            consent: consent(),
            previewToken: preview!.previewToken,
            idempotencyKey: key.current,
          });
      if (!r.ok) return setError(r.error.message);
      setJob(r.data);
      setStep(4);
    });

  const count = audience ? audiences.find((a) => a.id === audience)?.contactCount ?? 0 : (preview?.valid ?? 0) - (preview?.protected ?? 0);
  const titles = ["Choose a file", "Match columns", "Permission", "Import"];
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o && (step === 4 || step === 1)) reset();
      }}
      title="Import subscribers"
      description={
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span key={n} className={cn("h-[3px] flex-1 rounded-full", step >= n ? "bg-foreground" : "bg-border")} />
            ))}
          </div>
          <span>
            {step < 4 ? `Step ${step} of 3 · ` : ""}
            {titles[step - 1]}
          </span>
        </div>
      }
      footer={
        step === 4 ? (
          <>
            <span />
            <Button
              variant="primary"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Done
            </Button>
          </>
        ) : (
          <>
            <Button disabled={step === 1} onClick={() => setStep((s) => (s === 3 && audience ? 1 : ((s - 1) as 1 | 2)))}>
              Back
            </Button>
            {step === 3 ? (
              <Button variant="primary" loading={busy} disabled={!canImport || count <= 0} onClick={run}>
                Import {num(Math.max(0, count))} {count === 1 ? "subscriber" : "subscribers"}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={step === 1 ? !audience : !preview?.previewToken || busy}
                loading={busy && step === 2}
                onClick={() => setStep(step === 1 ? 3 : 3)}
              >
                Continue
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {error ? (
          <p role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        ) : null}

        {step === 1 ? (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pick(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                drag ? "border-foreground bg-background-hover" : "border-border-strong bg-background-subtle hover:bg-background-hover",
              )}
            >
              <FileSpreadsheet className="size-6 text-foreground-muted" aria-hidden />
              <span className="text-sm font-medium">{busy ? "Reading the file…" : "Drop a CSV file here, or choose one"}</span>
              <span className="text-xs text-foreground-muted">Up to 5,000 rows and 5 MB. One column must hold email addresses.</span>
            </button>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => pick(e.target.files?.[0])} />
            {audiences.length ? (
              <Field label="Or import an existing audience" htmlFor="imp-aud">
                <Select
                  ariaLabel="Audience"
                  placeholder="Choose an audience"
                  value={audience || undefined}
                  onValueChange={(v) => {
                    setAudience(v);
                    setFile(null);
                    setPreview(null);
                    key.current = crypto.randomUUID();
                  }}
                  options={audiences.map((a) => ({ value: a.id, label: `${a.name} · ${num(a.contactCount)}` }))}
                />
              </Field>
            ) : null}
          </>
        ) : null}

        {step === 2 && preview ? (
          <>
            <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
              <FileSpreadsheet className="size-4 text-foreground-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file?.name}</p>
                <p className="text-xs text-foreground-muted">
                  {num(preview.rows)} rows · {preview.headers.length} columns
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStep(1)}>
                Replace
              </Button>
            </div>
            <div className="flex flex-col gap-2.5">
              {MAP_FIELDS.map(([field, label]) => (
                <div key={field} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
                  <Label>{label}</Label>
                  <Select
                    ariaLabel={`${label} column`}
                    value={(mapping[field] as string | undefined) ?? SKIP}
                    onValueChange={(v) => remap({ ...mapping, [field]: v === SKIP ? undefined : v })}
                    options={[
                      ...(field === "email" ? [] : [{ value: SKIP, label: "Skip" }]),
                      ...preview.headers.map((h) => ({ value: h, label: h })),
                    ]}
                  />
                </div>
              ))}
            </div>
            <div className={cn("flex flex-wrap gap-1.5", busy && "opacity-50")}>
              <StatusBadge status="success" label={`${num(preview.valid - preview.existing - preview.protected)} new`} />
              <StatusBadge status="draft" label={`${num(preview.existing)} already here`} />
              {preview.invalid ? <StatusBadge status="pending" label={`${num(preview.invalid)} invalid`} /> : null}
              {preview.duplicates ? <StatusBadge status="draft" label={`${num(preview.duplicates)} duplicates`} /> : null}
              {preview.protected ? <StatusBadge status="draft" label={`${num(preview.protected)} opted out, kept out`} /> : null}
            </div>
            {preview.sample.length ? (
              <Table fixed={false} wrapperClassName="shadow-none">
                <THead>
                  <tr>
                    {preview.headers.slice(0, 4).map((h) => (
                      <TH key={h}>{h}</TH>
                    ))}
                  </tr>
                </THead>
                <TBody>
                  {preview.sample.slice(0, 5).map((row, i) => (
                    <TR key={i}>
                      {preview.headers.slice(0, 4).map((h) => (
                        <TD key={h} className="max-w-40 truncate text-xs">
                          {row[h]}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="text-sm text-foreground-muted">
              Only import people who agreed to receive this newsletter. Flaresend records where and when they agreed.
              People who unsubscribed before are never added back.
            </p>
            <Field label="Where did these people sign up?" htmlFor="imp-src">
              <Input id="imp-src" value={source} maxLength={500} placeholder="Example: Checkout opt-in on acme.dev" onChange={(e) => setSource(e.target.value)} />
            </Field>
            <Field label="When" htmlFor="imp-date">
              <Input id="imp-date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
              These people agreed to receive this newsletter.
            </label>
          </>
        ) : null}

        {step === 4 && job ? (
          <div role="status" className="flex flex-col gap-3">
            <p className="text-sm font-medium">
              {job.status === "completed" ? "Import finished." : job.status === "failed" ? "The import stopped." : "Importing…"}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-background-hover">
              <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${job.total ? (job.processed / job.total) * 100 : 100}%` }} />
            </div>
            <DetailList
              items={[
                ["Added", num(job.created)],
                ["Updated", num(job.updated)],
                ["Skipped", num(job.skipped)],
                ["Failed", num(job.failed)],
              ]}
            />
            {job.lastError ? <p className="text-sm text-danger-fg">{job.lastError}</p> : null}
            {job.errorCsv ? (
              <Button className="w-fit" onClick={() => download(job.errorCsv!, "import-errors.csv")}>
                <Download /> Download rows with errors
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

/** One subscriber: name, tags, permission record, activity, unsubscribe and delete. */
export function SubscriberDetail({ slug, initial, tags }: { slug: string; initial: NewsletterSubscriptionRecord; tags: NewsletterTag[] }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, start] = useTransition();
  const back = `/${slug}/newsletters/${s.publicationId}/subscribers`;
  const save = () =>
    start(async () => {
      const r = await newsletterAction(slug, "updateNewsletterSubscriber", s.publicationId, s.id, {
        expectedRevision: s.revision,
        firstName: s.firstName || null,
        lastName: s.lastName || null,
        tags: s.tags,
      });
      if (!r.ok) return toastError(r.error.message);
      setS(r.data);
      toastSuccess("Subscriber saved.");
    });
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-title font-semibold break-all">{s.email}</h2>
        <StatusBadge status={s.status} label={s.status === "pending" ? "Waiting to confirm" : undefined} />
        {s.blocked ? <Badge tone="danger">Suppressed</Badge> : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="sub-first">
              <Input id="sub-first" value={s.firstName ?? ""} maxLength={200} onChange={(e) => setS({ ...s, firstName: e.target.value })} />
            </Field>
            <Field label="Last name" htmlFor="sub-last">
              <Input id="sub-last" value={s.lastName ?? ""} maxLength={200} onChange={(e) => setS({ ...s, lastName: e.target.value })} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-xs font-medium">Tags</legend>
            {tags.length ? (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {tags.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={s.tags.includes(t.id)}
                      onCheckedChange={(v) => setS({ ...s, tags: v === true ? [...s.tags, t.id] : s.tags.filter((x) => x !== t.id) })}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">No tags yet. Add them from the Subscribers tab.</p>
            )}
          </fieldset>
        </CardContent>
        <CardFooter>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Permission record</CardTitle>
          <CardDescription>Where and when this person agreed to receive the newsletter.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              ["Source", s.consentSource || s.source || "—"],
              ["Agreed", <Time key="a" iso={s.consentAt} format="absolute" fallback="No date recorded" />],
              ["Confirmed by email", <Time key="c" iso={s.confirmedAt} format="absolute" fallback="No" />],
              ["Joined", <Time key="j" iso={s.createdAt} format="absolute" />],
              s.unsubscribedAt ? ["Unsubscribed", <Time key="u" iso={s.unsubscribedAt} format="absolute" />] : null,
            ]}
          />
        </CardContent>
      </Card>
      {s.events?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
              {s.events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-border-strong ring-4 ring-background-elevated" aria-hidden />
                  <span className="font-medium">{e.type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</span>
                  <span className="text-foreground-muted">
                    {" "}
                    · <Time iso={e.occurredAt} format="absolute" /> · by {e.actorKind}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
      <Card className="border-danger-border">
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Unsubscribe</p>
              <p className="text-sm text-foreground-muted">They stop receiving this newsletter. Imports will not add them back.</p>
            </div>
            <ConfirmDialog
              trigger={<Button disabled={s.status === "unsubscribed"}>Unsubscribe</Button>}
              title={`Unsubscribe ${s.email}?`}
              confirmLabel="Unsubscribe"
              tone="danger"
              onConfirm={async () => {
                const r = await newsletterAction(slug, "unsubscribeNewsletterSubscriber", s.publicationId, s.id, s.revision);
                if (!r.ok) return { error: r.error.message };
                setS(r.data);
                return { ok: true, message: "Unsubscribed." };
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Delete subscriber</p>
              <p className="text-sm text-foreground-muted">Removes this subscription and its history. The address stays blocked from imports.</p>
            </div>
            <ConfirmDialog
              trigger={
                <Button variant="danger">
                  <Trash2 /> Delete
                </Button>
              }
              title={`Delete ${s.email}?`}
              body="This cannot be undone."
              confirmLabel="Delete subscriber"
              tone="danger"
              onConfirm={async () => {
                const r = await newsletterAction(slug, "deleteNewsletterSubscriber", s.publicationId, s.id, s.revision);
                if (!r.ok) return { error: r.error.message };
                router.push(back);
                return { ok: true, message: "Subscriber deleted." };
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";
// Newsletter Website and Settings tabs. Each card saves on its own; the publication's revision guards every write.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ImagePlus, Sparkles } from "lucide-react";
import type { NewsletterCapabilities, PublicationRecord, UpdatePublicationInput } from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SwitchField } from "@/components/ui/switch";
import { StatusBadge, Notice } from "@/components/ui/badge";
import { CodeBlock, CopyButton } from "@/components/ui/code";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/tabs";
import { toastError, toastSuccess } from "@/components/ui/toast";
import { TimezoneSelect } from "./timezone-select";
import { LookPicker, LookPreview } from "./look";

type Patch = Omit<UpdatePublicationInput, "expectedRevision">;

function usePublication(slug: string, initial: PublicationRecord) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const revision = useRef(initial.revision);
  const save = async (patch: Patch, message = "Saved.") => {
    const r = await newsletterAction(slug, "updatePublication", p.id, { ...patch, expectedRevision: revision.current });
    if (!r.ok) {
      toastError(r.error.code === "revision_conflict" ? "Someone else changed this newsletter. Reload the page." : r.error.message);
      return false;
    }
    revision.current = r.data.revision;
    setP(r.data);
    toastSuccess(message);
    router.refresh();
    return true;
  };
  return { p, save };
}

const assetUrl = (slug: string, publicationId: string, id: string) =>
  `/api/newsletter-assets/${publicationId}/${id}?project=${encodeURIComponent(slug)}`;

export function WebsiteSettings({ slug, initial, capabilities }: { slug: string; initial: PublicationRecord; capabilities: NewsletterCapabilities }) {
  const { p, save } = usePublication(slug, initial);
  const [busy, start] = useTransition();
  const [view, setView] = useState<"desktop" | "phone">("desktop");
  const archived = p.status === "archived";
  const embed = `<iframe src="${p.publicUrl}/embed"\n  title="Subscribe to ${p.name.replace(/["<>]/g, "")}"\n  width="100%" height="320" style="border:0"></iframe>`;
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardContent className="flex flex-col gap-4 pt-5">
            <SwitchField
              label="Public website"
              description="An archive of published posts, with an RSS feed."
              checked={p.siteEnabled}
              disabled={busy || archived || !capabilities.webPublication}
              onCheckedChange={(v) =>
                start(async () => {
                  await save({ siteEnabled: v, ...(!v ? { formEnabled: false } : {}) }, v ? "Website is on." : "Website is off.");
                })
              }
            />
            <hr className="border-border" />
            <SwitchField
              label="Sign-up form"
              description={
                capabilities.subscriptionConfirmation ? (
                  "New subscribers confirm by email before they are added."
                ) : (
                  <>
                    Verify a sender first; the form sends a confirmation email.{" "}
                    <Link href={`/${slug}/newsletters/${p.id}/settings#sender`} className="font-medium text-foreground underline-offset-2 hover:underline">
                      Set up sender
                    </Link>
                  </>
                )
              }
              checked={p.formEnabled}
              disabled={busy || archived || !p.siteEnabled || !capabilities.subscriptionConfirmation}
              onCheckedChange={(v) => start(async () => void (await save({ formEnabled: v }, v ? "Sign-up form is on." : "Sign-up form is off.")))}
            />
          </CardContent>
        </Card>
        {!capabilities.webPublication && !archived ? (
          <Notice tone="warning">Set PUBLIC_BASE_URL on the mailer to an HTTPS address to publish a website.</Notice>
        ) : null}
        <Field label="Address">
          <div className="flex gap-1.5">
            <Input readOnly value={p.publicUrl} className="font-mono text-xs" aria-label="Website address" />
            <CopyButton value={p.publicUrl} label="Copy address" />
            {p.siteEnabled ? (
              <a
                href={p.publicUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open the website"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border-strong bg-background-elevated shadow-card hover:bg-background-hover"
              >
                <ArrowUpRight className="size-4" />
              </a>
            ) : null}
          </div>
        </Field>
        {p.formEnabled ? (
          <Field label="Embed the form on your own site" description="No script needed. Submitting opens the confirmation page.">
            <CodeBlock code={embed} />
          </Field>
        ) : null}
        {p.siteEnabled ? (
          <p className="text-xs text-foreground-muted">
            RSS feed:{" "}
            <a className="font-mono text-foreground underline-offset-2 hover:underline" href={`${p.publicUrl}/feed.xml`} target="_blank" rel="noreferrer">
              {p.publicUrl.replace(/^https?:\/\//, "")}/feed.xml
            </a>
          </p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-background-subtle lg:sticky lg:top-8">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-background-elevated px-3 py-2">
          <span className="text-xs text-foreground-muted">Website preview</span>
          <Segmented
            ariaLabel="Width"
            value={view}
            onChange={setView}
            options={[
              { value: "desktop", label: "Wide" },
              { value: "phone", label: "Phone" },
            ]}
          />
        </div>
        <div className={view === "phone" ? "mx-auto max-w-[375px]" : undefined}>
          <LookPreview
            theme={p.theme}
            name={p.name}
            description={p.description || p.name}
            target="web"
            logoUrl={p.logoAssetId ? assetUrl(slug, p.id, p.logoAssetId) : null}
          />
        </div>
      </div>
    </div>
  );
}

export function PublicationSettings({ slug, initial, capabilities }: { slug: string; initial: PublicationRecord; capabilities: NewsletterCapabilities }) {
  const router = useRouter();
  const { p, save } = usePublication(slug, initial);
  const archived = p.status === "archived";
  const [identity, setIdentity] = useState({ name: p.name, description: p.description, timezone: p.timezone, logoAssetId: p.logoAssetId });
  const [theme, setTheme] = useState(p.theme);
  const [sender, setSender] = useState({ fromName: p.fromName, fromAddress: p.fromAddress ?? "", replyTo: p.replyTo ?? "", postalAddress: p.postalAddress });
  const [notes, setNotes] = useState(p.aiInstructions);
  const [busy, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const senderBlocked = capabilities.emailBlocker === "sender_missing" || capabilities.emailBlocker === "sender_unverified";
  const senderDomain = sender.fromAddress.split("@")[1];

  const card = (fn: () => Promise<unknown>) => () => start(async () => void (await fn()));
  return (
    <fieldset disabled={archived} className="flex max-w-[760px] flex-col gap-5">
      {archived ? <Notice tone="muted">This newsletter is archived. Settings can no longer change.</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Shown on the website and at the top of every email.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Name" htmlFor="set-name">
            <Input id="set-name" required maxLength={100} value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="set-desc" optional>
            <Textarea id="set-desc" rows={2} className="min-h-0" maxLength={300} value={identity.description} onChange={(e) => setIdentity({ ...identity, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Timezone" htmlFor="set-zone" description="Schedules and daily reports use it. Existing schedules keep their time.">
              <TimezoneSelect id="set-zone" value={identity.timezone} onChange={(timezone) => setIdentity({ ...identity, timezone })} />
            </Field>
            <Field label="Logo">
              <div className="flex items-center gap-2">
                {identity.logoAssetId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(slug, p.id, identity.logoAssetId)} alt="" className="size-8 rounded-md border border-border object-contain" />
                ) : (
                  <span className="grid size-8 place-items-center rounded-md border border-dashed border-border-strong text-foreground-subtle">
                    <ImagePlus className="size-4" aria-hidden />
                  </span>
                )}
                <Button size="sm" loading={uploading} onClick={() => file.current?.click()}>
                  {identity.logoAssetId ? "Replace" : "Upload"}
                </Button>
                {identity.logoAssetId ? (
                  <Button size="sm" variant="ghost" onClick={() => setIdentity({ ...identity, logoAssetId: null })}>
                    Remove
                  </Button>
                ) : null}
                <input
                  ref={file}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Logo file"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) return toastError("Use an image below 5 MB.");
                    setUploading(true);
                    const base64 = await new Promise<string>((resolve) => {
                      const r = new FileReader();
                      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
                      r.readAsDataURL(f);
                    });
                    const r = await newsletterAction(slug, "uploadNewsletterAsset", p.id, { base64, mimeType: f.type });
                    setUploading(false);
                    if (r.ok) setIdentity({ ...identity, logoAssetId: r.data.id });
                    else toastError(r.error.message);
                  }}
                />
              </div>
            </Field>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            variant="primary"
            loading={busy}
            disabled={!identity.name.trim()}
            onClick={card(() => save({ name: identity.name.trim(), description: identity.description.trim(), timezone: identity.timezone, logoAssetId: identity.logoAssetId }))}
          >
            Save
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Look</CardTitle>
          <CardDescription>Applies to new previews, posts you publish next, and emails you send next.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <LookPicker value={theme} onChange={setTheme} />
          <div className="overflow-hidden rounded-lg border border-border">
            <LookPreview theme={theme} name={identity.name} target="email" logoUrl={identity.logoAssetId ? assetUrl(slug, p.id, identity.logoAssetId) : null} />
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="primary" loading={busy} onClick={card(() => save({ theme }))}>
            Save
          </Button>
        </CardFooter>
      </Card>

      <Card id="sender" className="scroll-mt-8">
        <CardHeader actions={<StatusBadge status={senderBlocked ? "pending" : "onboarded"} label={senderBlocked ? "Not verified" : "Verified"} />}>
          <CardTitle>Sender</CardTitle>
          <CardDescription>Emails and confirmation links come from this address.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {senderBlocked && sender.fromAddress ? (
            <Notice tone="warning">
              {senderDomain ? <>Verify <span className="font-medium">{senderDomain}</span> before sending. </> : null}
              <Link href={`/${slug}/domains`} className="font-medium text-foreground underline-offset-2 hover:underline">
                Open Domains
              </Link>
            </Notice>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From name" htmlFor="set-from-name">
              <Input id="set-from-name" maxLength={100} placeholder={identity.name} value={sender.fromName} onChange={(e) => setSender({ ...sender, fromName: e.target.value })} />
            </Field>
            <Field label="From address" htmlFor="set-from">
              <Input id="set-from" type="email" placeholder="news@yourdomain.com" value={sender.fromAddress} onChange={(e) => setSender({ ...sender, fromAddress: e.target.value.trim() })} />
            </Field>
            <Field label="Reply-to" htmlFor="set-reply" optional>
              <Input id="set-reply" type="email" value={sender.replyTo} onChange={(e) => setSender({ ...sender, replyTo: e.target.value.trim() })} />
            </Field>
            <Field label="Postal address" htmlFor="set-postal" description="Shown in the footer of every email.">
              <Input id="set-postal" maxLength={500} value={sender.postalAddress} onChange={(e) => setSender({ ...sender, postalAddress: e.target.value })} />
            </Field>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            variant="primary"
            loading={busy}
            onClick={card(() =>
              save({
                fromName: sender.fromName.trim(),
                fromAddress: sender.fromAddress || null,
                replyTo: sender.replyTo || null,
                postalAddress: sender.postalAddress.trim(),
              }),
            )}
          >
            Save
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader actions={<StatusBadge status={capabilities.ai ? "enabled" : "disabled"} label={capabilities.ai ? "Connected" : "Not set up"} />}>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-ai-fg" aria-hidden /> AI writing help
          </CardTitle>
          <CardDescription>
            {capabilities.ai
              ? "Drafts, rewrites, subject lines and image descriptions run on Workers AI in your own Cloudflare account."
              : "Add the Workers AI binding to the mailer to use AI."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Voice and style notes" htmlFor="set-ai" description="AI reads these notes before every draft or rewrite for this newsletter.">
            <Textarea
              id="set-ai"
              rows={3}
              maxLength={2000}
              value={notes}
              placeholder="Plain and direct. Short sentences. We write as “we”. No exclamation marks."
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button variant="primary" loading={busy} onClick={card(() => save({ aiInstructions: notes }))}>
            Save
          </Button>
        </CardFooter>
      </Card>

      {!archived ? (
        <Card className="border-danger-border">
          <CardContent className="flex flex-wrap items-center gap-4 pt-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Archive this newsletter</p>
              <p className="text-sm text-foreground-muted">Stops new sign-ups and sends. Published posts stay online.</p>
            </div>
            <ConfirmDialog
              trigger={<Button variant="danger">Archive</Button>}
              title={`Archive ${p.name}?`}
              body="Sign-ups and sends stop. Published posts stay on the website. This cannot be undone from the dashboard."
              confirmLabel="Archive newsletter"
              tone="danger"
              typeToConfirm={p.slug}
              onConfirm={async () => {
                const r = await newsletterAction(slug, "archivePublication", p.id, p.revision);
                if (!r.ok) return { error: r.error.message };
                router.refresh();
                return { ok: true, message: "Newsletter archived." };
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </fieldset>
  );
}

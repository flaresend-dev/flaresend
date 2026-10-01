"use client";
// New newsletter: name, address, timezone and look on one page, with a live preview beside it.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import type { NewsletterTheme } from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { Button, LinkButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { toastError } from "@/components/ui/toast";
import { slugify } from "@/lib/nav";
import { TimezoneSelect } from "./timezone-select";
import { LookPicker, LookPreview } from "./look";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function NewsletterSetup({ slug, taken, addressBase }: { slug: string; taken: string[]; addressBase: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [touched, setTouched] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [theme, setTheme] = useState<NewsletterTheme>({ layout: "letter", accent: "#c2410c", font: "sans" });
  const [target, setTarget] = useState<"email" | "web">("email");
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    } catch {
      /* keep UTC */
    }
  }, []);

  const addressState = !address ? null : !SLUG_RE.test(address) ? "invalid" : taken.includes(address) ? "taken" : "ok";

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!name.trim()) return setError({ field: "name", message: "Give the newsletter a name." });
          if (addressState !== "ok") return setError({ field: "address", message: "Choose an available web address." });
          start(async () => {
            const r = await newsletterAction(slug, "createPublication", {
              name: name.trim(),
              slug: address,
              description: description.trim(),
              timezone,
              theme,
            });
            if (!r.ok) {
              if (r.error.code === "publication_slug_exists") setError({ field: "address", message: "This address is already used." });
              else toastError(r.error.message);
              return;
            }
            router.push(`/${slug}/newsletters/${r.data.id}`);
          });
        }}
      >
        <Field label="Name" htmlFor="nl-name" error={error?.field === "name" ? error.message : undefined}>
          <Input
            id="nl-name"
            autoFocus
            maxLength={100}
            value={name}
            placeholder="Field Notes"
            aria-invalid={error?.field === "name"}
            onChange={(e) => {
              setName(e.target.value);
              if (!touched) setAddress(slugify(e.target.value));
            }}
          />
        </Field>
        <Field label="Description" htmlFor="nl-description" optional description="Shown on the website and to new subscribers.">
          <Textarea
            id="nl-description"
            rows={2}
            maxLength={300}
            value={description}
            placeholder="What readers can expect, and how often."
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-0"
          />
        </Field>
        <Field
          label="Web address"
          htmlFor="nl-address"
          error={error?.field === "address" ? error.message : undefined}
          description={
            addressState === "ok" ? (
              <span className="inline-flex items-center gap-1 text-success-fg">
                <Check className="size-3.5" aria-hidden /> Available
              </span>
            ) : addressState === "taken" ? (
              <span className="inline-flex items-center gap-1 text-danger-fg">
                <X className="size-3.5" aria-hidden /> Already used by another newsletter
              </span>
            ) : addressState === "invalid" ? (
              "Use lowercase letters, digits and dashes. Start with a letter or digit."
            ) : (
              "Filled in from the name."
            )
          }
        >
          <Input
            id="nl-address"
            maxLength={63}
            value={address}
            aria-invalid={addressState === "taken" || addressState === "invalid"}
            prefix={<span className="max-w-[220px] truncate text-xs">{addressBase}</span>}
            style={{ paddingLeft: Math.min(220, Math.ceil(addressBase.length * 6.6)) + 18 }}
            onChange={(e) => {
              setTouched(true);
              setAddress(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
            }}
          />
        </Field>
        <Field label="Timezone" htmlFor="nl-zone" description="Used for schedules and daily reports.">
          <TimezoneSelect id="nl-zone" value={timezone} onChange={setTimezone} />
        </Field>
        <hr className="border-border" />
        <LookPicker value={theme} onChange={setTheme} />
        <div className="flex justify-end gap-2 pt-2">
          <LinkButton href={`/${slug}/newsletters`} variant="secondary">
            Cancel
          </LinkButton>
          <Button type="submit" variant="primary" loading={pending}>
            Create newsletter
          </Button>
        </div>
      </form>
      <aside className="overflow-hidden rounded-lg border border-border bg-background-subtle lg:sticky lg:top-8">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-background-elevated px-3 py-2">
          <span className="text-xs text-foreground-muted">How a post will look</span>
          <Segmented
            ariaLabel="Preview"
            value={target}
            onChange={setTarget}
            options={[
              { value: "email", label: "Email" },
              { value: "web", label: "Website" },
            ]}
          />
        </div>
        <LookPreview theme={theme} name={name} description={description || name} target={target} />
      </aside>
    </div>
  );
}

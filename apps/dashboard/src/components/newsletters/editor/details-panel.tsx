"use client";
// Email and website fields for a post: subject, preview text, address, author.
import { useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import type { NewsletterPostRecord, PublicationRecord } from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function Counter({ n, hint }: { n: number; hint: number }) {
  return <span className={cn("text-2xs tabular-nums", n > hint ? "text-warning-fg" : "text-foreground-subtle")}>{n} / {hint}</span>;
}

export function DetailsPanel({
  slug, publication, post, ai, readOnly, onChange, bodyMarkdown,
}: {
  slug: string;
  publication: PublicationRecord;
  post: NewsletterPostRecord;
  ai: boolean;
  readOnly: boolean;
  onChange: (patch: Partial<NewsletterPostRecord>) => void;
  bodyMarkdown: () => string;
}) {
  const subject = post.subjectOverridden ? post.subject : post.title;
  const urlBase = `${publication.publicUrl}/p/`;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Email</h2>
        <Field label={<span className="flex w-full justify-between">Subject <Counter n={subject.length} hint={60} /></span>} htmlFor="nl-subject">
          <div className="flex gap-1">
            <Input
              id="nl-subject"
              value={subject}
              maxLength={200}
              readOnly={readOnly}
              placeholder="Same as the title"
              onChange={(e) => onChange({ subject: e.target.value, subjectOverridden: true })}
            />
            {ai && !readOnly ? (
              <SubjectSuggestions
                slug={slug}
                publicationId={publication.id}
                title={post.title}
                body={bodyMarkdown}
                onPick={(s) =>
                  onChange({
                    subject: s.subject.slice(0, 200),
                    subjectOverridden: true,
                    ...(!post.previewText && s.previewText ? { previewText: s.previewText.slice(0, 200) } : {}),
                  })
                }
              />
            ) : null}
          </div>
        </Field>
        {post.subjectOverridden && post.subject !== post.title ? (
          <button
            type="button"
            className="-mt-1.5 w-fit text-xs text-foreground-muted underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => onChange({ subject: post.title, subjectOverridden: false })}
          >
            Use the title
          </button>
        ) : null}
        <Field label={<span className="flex w-full justify-between">Preview text <Counter n={post.previewText.length} hint={110} /></span>} htmlFor="nl-preview">
          <Textarea
            id="nl-preview"
            rows={2}
            className="min-h-0"
            maxLength={200}
            readOnly={readOnly}
            value={post.previewText}
            placeholder="The line shown after the subject in the inbox"
            onChange={(e) => onChange({ previewText: e.target.value.replace(/\n/g, " ") })}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-foreground-subtle">In the inbox</span>
          <div className="flex gap-2.5 rounded-md border border-border bg-background-elevated px-3 py-2.5">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
              style={{ background: publication.theme.accent }}
              aria-hidden
            >
              {(publication.fromName || publication.name).trim()[0]?.toUpperCase() ?? "N"}
            </span>
            <div className="min-w-0 flex-1 leading-snug">
              <div className="flex justify-between gap-2">
                <span className="truncate text-xs font-semibold">{publication.fromName || publication.name}</span>
                <span className="text-2xs text-foreground-subtle">now</span>
              </div>
              <p className="truncate text-xs font-medium">{subject || "No subject"}</p>
              <p className="truncate text-xs text-foreground-muted">{post.previewText || "No preview text"}</p>
            </div>
          </div>
        </div>
      </section>
      <hr className="border-border" />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Website</h2>
        <Field
          label="Address"
          htmlFor="nl-slug"
          description={post.publishedAt ? "Fixed after the first publication." : undefined}
        >
          <Input
            id="nl-slug"
            value={post.slug}
            readOnly={readOnly || !!post.publishedAt}
            prefix={<span className="max-w-[110px] truncate text-xs" title={urlBase}>…/p/</span>}
            className="[&_input]:pl-12"
            onChange={(e) => onChange({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 63) })}
          />
        </Field>
        <Field label="Author" htmlFor="nl-author" optional>
          <Input
            id="nl-author"
            maxLength={100}
            readOnly={readOnly}
            value={post.authorLabel}
            onChange={(e) => onChange({ authorLabel: e.target.value })}
          />
        </Field>
      </section>
    </div>
  );
}

type Suggestion = { subject: string; previewText: string };

function SubjectSuggestions({
  slug, publicationId, title, body, onPick,
}: {
  slug: string;
  publicationId: string;
  title: string;
  body: () => string;
  onPick: (s: Suggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    const r = await newsletterAction(slug, "newsletterAi", publicationId, {
      action: "subjects",
      title: title.slice(0, 100),
      content: body().slice(0, 12000),
    });
    setBusy(false);
    if (!r.ok) {
      toastError(r.error.message);
      setOpen(false);
      return;
    }
    setList(r.data.subjects ?? []);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !list) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="Suggest subject lines" className="text-ai-fg">
          <Sparkles />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1">
          <span className="text-2xs font-medium text-foreground-subtle">Suggested subjects</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="inline-flex items-center gap-1 text-2xs text-foreground-muted hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="size-3" /> More
          </button>
        </div>
        {busy ? (
          <div className="flex flex-col gap-2 p-2.5">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-9/12" />
            <Skeleton className="h-4 w-10/12" />
          </div>
        ) : list?.length ? (
          list.map((s) => (
            <button
              key={s.subject}
              type="button"
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
              className="flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm hover:bg-background-hover focus-visible:bg-background-hover focus-visible:outline-none"
            >
              <span className="min-w-0">
                <span className="block">{s.subject}</span>
                {s.previewText ? <span className="block truncate text-xs text-foreground-muted">{s.previewText}</span> : null}
              </span>
              <span className="shrink-0 text-2xs text-foreground-subtle tabular-nums">{s.subject.length}</span>
            </button>
          ))
        ) : (
          <p className="px-2.5 py-3 text-xs text-foreground-muted">No suggestions. Write a little more, then try again.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

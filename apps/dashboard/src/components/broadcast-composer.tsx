"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Send } from "lucide-react";
import type { AudienceRecord, BroadcastRecord, TemplateRecord } from "@flaresend/types";
import type { ActionState } from "@/lib/action-state";
import { renderMustache } from "@/lib/mustache";
import { num } from "@/lib/format";
import { useLink } from "@/lib/use-link";
import { saveBroadcastAction, sendBroadcastAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Label } from "@/components/ui/field";
import { ActionStatus } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { toastResult } from "@/components/ui/toast";
import { CodeEditor } from "@/components/code-editor";
import { HtmlFrame } from "@/components/content-viewer";

const SAMPLE_CONTACT = { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" };

type TemplateOption = Pick<TemplateRecord, "name" | "subject" | "html" | "text">;

/**
 * Compose or edit a draft broadcast: form on the left, live preview on the right, and a sticky bar with
 * Save draft · Schedule · Send now. Every button saves the draft first.
 */
export function BroadcastComposer({ slug, broadcast, audiences, defaultFrom, templates }: {
  slug: string;
  broadcast: BroadcastRecord | null;
  audiences: AudienceRecord[];
  defaultFrom: string;
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const to = useLink(slug);
  const [audienceId, setAudienceId] = useState(broadcast?.audienceId ?? audiences[0]?.id ?? "");
  const [from, setFrom] = useState(broadcast ? (broadcast.fromName ? `${broadcast.fromName} <${broadcast.from}>` : broadcast.from) : defaultFrom);
  const [subject, setSubject] = useState(broadcast?.subject ?? "");
  const [html, setHtml] = useState(broadcast?.html ?? "<p>Hi {{first_name}},</p>\n");
  const [text, setText] = useState(broadcast?.text ?? "");
  const [scheduleAt, setScheduleAt] = useState("");
  const [status, setStatus] = useState<ActionState>({});
  const [pendingTemplate, setPendingTemplate] = useState<TemplateOption | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [pending, start] = useTransition();

  const preview = useMemo(() => renderMustache(html, SAMPLE_CONTACT), [html]);
  const audience = audiences.find((a) => a.id === audienceId);
  const input = { audienceId, from, subject, html, text };

  const save = async (): Promise<BroadcastRecord | null> => {
    const r = await saveBroadcastAction(slug, broadcast?.id ?? null, input);
    setStatus(r.ok ? {} : r);
    if (!r.ok) toastResult(r);
    return r.ok ? (r.data as BroadcastRecord) : null;
  };

  const go = (b: BroadcastRecord) => router.push(to("broadcasts", b.id));

  const send = (when: string | null) =>
    start(async () => {
      const b = await save();
      if (!b) return;
      const r = await sendBroadcastAction(slug, b.id, when);
      setStatus(r.ok ? {} : r);
      toastResult(r);
      if (r.ok) go(b);
      else if (!broadcast) go(b);
    });

  return (
    <div className="flex flex-col">
      {!audiences.length ? (
        <Notice tone="warning" className="mb-6" title="Create an audience first">
          A broadcast goes to one audience. Add one on the Audiences page.
        </Notice>
      ) : null}

      <div className="grid items-start gap-6 pb-24 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience">
              <Select
                ariaLabel="Audience"
                value={audienceId || undefined}
                onValueChange={setAudienceId}
                placeholder="Choose an audience"
                options={audiences.map((a) => ({ value: a.id, label: a.name, description: `${num(a.contactCount)} contacts` }))}
              />
            </Field>
            <Field label="From" htmlFor="bc-from">
              <Input id="bc-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Name <news@yourdomain.com>" />
            </Field>
          </div>
          <Field label="Subject" htmlFor="bc-subject">
            <Input id="bc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's new in September" />
          </Field>
          {templates.length ? (
            <Field label="Start from template" optional description="Copies the template's subject and body into this broadcast.">
              <Select
                ariaLabel="Start from template"
                value=""
                placeholder="Choose a template…"
                onValueChange={(v) => setPendingTemplate(templates.find((t) => t.name === v) ?? null)}
                options={templates.map((t) => ({ value: t.name, label: <span className="font-mono text-xs">{t.name}</span> }))}
              />
            </Field>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label>HTML</Label>
            <CodeEditor value={html} onChange={setHtml} language="html" height="420px" ariaLabel="Broadcast HTML" />
            <p className="text-xs text-foreground-muted">
              Placeholders: <code className="font-mono">{"{{first_name}}"}</code>, <code className="font-mono">{"{{last_name}}"}</code>,{" "}
              <code className="font-mono">{"{{email}}"}</code> and any key in the contact&apos;s data. Every broadcast email gets a one-click unsubscribe link.
            </p>
          </div>
          <details className="group" open={Boolean(broadcast?.text)}>
            <summary className="w-fit cursor-pointer list-none text-xs font-medium text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Plain text version</span>
              <span className="hidden group-open:inline">Hide plain text version</span>
            </summary>
            <Textarea className="mt-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} rows={6} aria-label="Plain text version" />
          </details>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-6">
          <p className="text-xs font-medium text-foreground-muted">Preview · sample contact Ada Lovelace</p>
          {preview.error ? <p className="rounded-md border border-danger-border bg-danger-bg px-2.5 py-1.5 font-mono text-xs text-danger-fg">Template error: {preview.error}</p> : null}
          <div className="overflow-hidden rounded-lg border border-border bg-background-elevated shadow-card">
            <div className="truncate border-b border-border px-4 py-2.5 text-sm">
              <span className="text-foreground-muted">Subject </span>
              <span className="font-medium">{renderMustache(subject, SAMPLE_CONTACT, { escape: false }).out || "—"}</span>
            </div>
            <HtmlFrame title="Broadcast preview" html={preview.out} className="h-[520px] rounded-none border-0" />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur md:-mx-10 md:px-10">
        <ActionStatus state={status} className="mb-2" />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const b = await save();
                if (!b) return;
                toastResult({ ok: true, message: "Draft saved." });
                if (!broadcast) go(b);
                else router.refresh();
              })
            }
          >
            Save draft
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" disabled={pending || !audienceId}>
                <CalendarClock /> Schedule
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="w-72">
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(scheduleAt);
                }}
              >
                <Field label="Send at" htmlFor="bc-at" description="Your local time.">
                  <Input id="bc-at" type="datetime-local" required value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                </Field>
                <Button type="submit" variant="primary" loading={pending} disabled={!scheduleAt}>
                  Schedule
                </Button>
              </form>
            </PopoverContent>
          </Popover>
          <Button variant="primary" disabled={pending || !audienceId} onClick={() => setConfirmSend(true)}>
            <Send /> Send now
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title={`Send to ${audience ? `${num(audience.contactCount)} contacts in ${audience.name}` : "this audience"}?`}
        body="Unsubscribed and suppressed addresses are skipped. Sending starts right away."
        confirmLabel="Send now"
        successMessage=""
        onConfirm={() => {
          send(null);
        }}
      />
      <ConfirmDialog
        open={pendingTemplate !== null}
        onOpenChange={(v) => !v && setPendingTemplate(null)}
        title={`Use template ${pendingTemplate?.name ?? ""}?`}
        body="The subject, HTML and plain text here are replaced with the template's."
        confirmLabel="Replace"
        successMessage=""
        onConfirm={() => {
          if (!pendingTemplate) return;
          setSubject(pendingTemplate.subject);
          setHtml(pendingTemplate.html ?? "");
          setText(pendingTemplate.text ?? "");
        }}
      />
    </div>
  );
}

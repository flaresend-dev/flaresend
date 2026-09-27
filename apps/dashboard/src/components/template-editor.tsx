"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Braces, History, Plus, Send, Trash2, X } from "lucide-react";
import type { RenderedTemplate, TemplateRecord, TemplateVariable, TemplateVersionRecord } from "@flaresend/types";
import { renderMustache } from "@/lib/mustache";
import { examplesFromVariables, exampleToText, parseExample } from "@/lib/template-vars";
import { p } from "@/lib/nav";
import type { ActionState } from "@/lib/action-state";
import {
  deleteTemplateAction, renderTemplateAction, restoreTemplateAction, saveTemplateAction, sendTestTemplateAction,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, MoreButton } from "@/components/ui/dropdown-menu";
import { Field, Label } from "@/components/ui/field";
import { ActionStatus } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/tabs";
import { Time } from "@/components/ui/time";
import { toast, toastResult } from "@/components/ui/toast";
import { CodeEditor } from "@/components/code-editor";
import { HtmlFrame } from "@/components/content-viewer";

interface VarRow {
  name: string;
  required: boolean;
  example: string;
}

const STARTER_HTML = "<!doctype html>\n<html>\n  <body>\n    <p>Hello {{first_name}},</p>\n  </body>\n</html>\n";

/**
 * Full-page split editor for an editable (database) template: editors on the left, live preview on the right.
 * "Draft" renders the unsaved text in the browser with the same {{var}} syntax; "Saved" asks the mailer
 * (renderTemplate) to render the stored version with the example values. Variables live in a side sheet.
 */
export function TemplateEditor({ slug, template, versions }: { slug: string; template: TemplateRecord | null; versions: TemplateVersionRecord[] }) {
  const router = useRouter();
  const isNew = template === null;
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [html, setHtml] = useState(template?.html ?? STARTER_HTML);
  const [text, setText] = useState(template?.text ?? "");
  const [vars, setVars] = useState<VarRow[]>(
    (template?.variables ?? [{ name: "first_name", required: false, example: "Ada" }]).map((v) => ({
      name: v.name,
      required: Boolean(v.required),
      example: exampleToText(v.example),
    })),
  );
  const [preview, setPreview] = useState<"draft" | "saved">("draft");
  const [saved, setSaved] = useState<RenderedTemplate | null>(null);
  const [status, setStatus] = useState<ActionState>({});
  const [panel, setPanel] = useState<null | "variables" | "history" | "test" | "delete">(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [testTo, setTestTo] = useState("");
  const [pending, start] = useTransition();

  const variables: TemplateVariable[] = useMemo(
    () =>
      vars
        .filter((v) => v.name.trim())
        .map((v) => {
          const ex = parseExample(v.example);
          return { name: v.name.trim(), required: v.required, ...(ex !== undefined ? { example: ex } : {}) };
        }),
    [vars],
  );
  const data = useMemo(() => examplesFromVariables(variables), [variables]);

  // Draft preview, rendered locally on every keystroke.
  const draft = useMemo(() => {
    const h = renderMustache(html, data);
    const s = renderMustache(subject, data, { escape: false });
    const t = renderMustache(text, data, { escape: false });
    return { html: h.out, subject: s.out, text: t.out, error: h.error ?? s.error ?? t.error };
  }, [html, subject, text, data]);

  async function renderSaved() {
    if (!template) return;
    const r = await renderTemplateAction(slug, template.name, data);
    if (r.ok) setSaved(r.data as RenderedTemplate);
    else toastResult(r);
  }
  useEffect(() => {
    if (preview === "saved") void renderSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const run = (fn: () => Promise<ActionState>, after?: (r: ActionState) => void) =>
    start(async () => {
      const r = await fn();
      setStatus(r.ok ? {} : r);
      toastResult(r);
      if (r.ok) after?.(r);
    });

  const save = () =>
    run(
      () => saveTemplateAction(slug, isNew ? null : template.name, { name: name.trim(), subject, html, text, variables }),
      (r) => {
        const t = r.data as TemplateRecord;
        if (isNew) router.push(p(slug, "templates", t.name));
        else router.refresh();
      },
    );

  const shown = preview === "draft" ? draft : saved;
  const nextVersion = (template?.version ?? 0) + 1;

  return (
    <>
      <PageHeader
        back={{ href: p(slug, "templates"), label: "Templates" }}
        title={
          isNew ? (
            "New template"
          ) : (
            <span className="flex items-center gap-2.5">
              <span className="font-mono">{template.name}</span>
              <Badge tone="violet">Editable</Badge>
              <span className="text-sm font-normal text-foreground-muted">v{template.version}</span>
            </span>
          )
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setPanel("variables")}>
              <Braces /> Variables <span className="text-foreground-subtle tabular-nums">{variables.length}</span>
            </Button>
            {!isNew ? (
              <Button variant="secondary" onClick={() => setPanel("test")}>
                <Send /> Send test email
              </Button>
            ) : null}
            <Button variant="primary" loading={pending} onClick={save}>
              {isNew ? "Create template" : "Save"}
            </Button>
            {!isNew ? (
              <DropdownMenu>
                <MoreButton className="size-8" />
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setPanel("history")}>
                    <History /> Version history…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem tone="danger" onSelect={() => setPanel("delete")}>
                    <Trash2 /> Delete template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      <ActionStatus state={status} className="mb-4" />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* left: editors */}
        <div className="flex min-w-0 flex-col gap-4">
          {isNew ? (
            <Field label="Name" htmlFor="tpl-name" description="Lowercase letters, digits, - and _. You send it with template: &quot;name&quot;.">
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="welcome" className="font-mono" autoFocus />
            </Field>
          ) : null}
          <Field label="Subject" htmlFor="tpl-subject">
            <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Welcome, {{first_name}}" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label>HTML</Label>
            <CodeEditor value={html} onChange={setHtml} language="html" height="480px" ariaLabel="HTML body" />
            <p className="text-xs text-foreground-muted">
              <code className="font-mono">{"{{name}}"}</code> escaped, <code className="font-mono">{"{{{raw}}}"}</code> unescaped,{" "}
              <code className="font-mono">{"{{#if x}}…{{else}}…{{/if}}"}</code>, <code className="font-mono">{"{{#each list}}{{this}}{{/each}}"}</code>.
            </p>
          </div>
          <details className="group" open={Boolean(template?.text)}>
            <summary className="w-fit cursor-pointer list-none text-xs font-medium text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Plain text version</span>
              <span className="hidden group-open:inline">Hide plain text version</span>
            </summary>
            <div className="mt-2">
              <CodeEditor value={text} onChange={setText} language="text" height="160px" ariaLabel="Plain text body" />
              <p className="mt-1.5 text-xs text-foreground-muted">Optional. Without it, email clients that do not show HTML get a text version made from the HTML.</p>
            </div>
          </details>
          {!isNew ? <p className="text-xs text-foreground-muted">Saving creates version {nextVersion}. Earlier versions stay in the history.</p> : null}
        </div>

        {/* right: preview */}
        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-2">
            <Segmented
              ariaLabel="Preview source"
              value={preview}
              onChange={setPreview}
              options={[
                { value: "draft", label: "Draft" },
                { value: "saved", label: "Saved", disabled: isNew },
              ]}
            />
            <span className="text-xs text-foreground-muted">{preview === "draft" ? "Your unsaved edits, with the example data" : "Rendered by the mailer"}</span>
          </div>
          {preview === "draft" && draft.error ? (
            <p className="rounded-md border border-danger-border bg-danger-bg px-2.5 py-1.5 font-mono text-xs text-danger-fg">Template error: {draft.error}</p>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border bg-background-elevated shadow-card">
            <div className="truncate border-b border-border px-4 py-2.5 text-sm">
              <span className="text-foreground-muted">Subject </span>
              <span className="font-medium">{shown?.subject || "—"}</span>
            </div>
            <HtmlFrame title="Template preview" html={shown?.html ?? ""} className="h-[560px] rounded-none border-0" />
          </div>
        </div>
      </div>

      {/* Variables */}
      <Sheet
        open={panel === "variables"}
        onOpenChange={(v) => !v && setPanel(null)}
        title="Variables"
        description="Required variables that are missing at send time return invalid_template_data. Examples drive the preview and test sends."
        footer={
          <Button variant="secondary" size="sm" onClick={() => setVars((v) => [...v, { name: "", required: false, example: "" }])}>
            <Plus /> Add variable
          </Button>
        }
      >
        {vars.length ? (
          <ul className="flex flex-col gap-3">
            {vars.map((v, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    className="font-mono text-xs"
                    value={v.name}
                    aria-label="Variable name"
                    placeholder="first_name"
                    onChange={(e) => setVars((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <Button variant="ghost" size="icon-sm" aria-label="Remove variable" onClick={() => setVars((all) => all.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
                <Input
                  className="font-mono text-xs"
                  value={v.example}
                  aria-label="Example value"
                  placeholder='Example: Ada, 42, ["a","b"] or {"n":1}'
                  onChange={(e) => setVars((all) => all.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))}
                />
                <label className="flex items-center gap-2 text-xs text-foreground-muted">
                  <Checkbox checked={v.required} onCheckedChange={(c) => setVars((all) => all.map((x, j) => (j === i ? { ...x, required: c === true } : x)))} />
                  Required
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground-muted">No variables. Add one for each {"{{name}}"} the template uses.</p>
        )}
      </Sheet>

      {!isNew ? (
        <>
          {/* Version history */}
          <Sheet open={panel === "history"} onOpenChange={(v) => !v && setPanel(null)} title="Version history" description="Restoring saves the old version as a new version.">
            {versions.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {[...versions]
                  .sort((a, b) => b.version - a.version)
                  .map((v) => (
                    <li key={v.version} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          Version {v.version}
                          {v.version === template.version ? <Badge tone="success">Current</Badge> : null}
                        </span>
                        <span className="truncate text-xs text-foreground-muted">{v.subject}</span>
                        <Time iso={v.createdAt} format="absolute" className="text-xs text-foreground-subtle" />
                      </div>
                      {v.version !== template.version ? (
                        <Button size="sm" variant="secondary" onClick={() => setRestoring(v.version)}>
                          Restore
                        </Button>
                      ) : null}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-foreground-muted">No versions recorded.</p>
            )}
          </Sheet>
          <ConfirmDialog
            open={restoring !== null}
            onOpenChange={(v) => !v && setRestoring(null)}
            title={`Restore version ${restoring ?? ""}?`}
            body="It is saved as a new version. Unsaved edits in the editor are lost."
            confirmLabel="Restore"
            onConfirm={() => (restoring !== null ? restoreTemplateAction(slug, template.name, restoring) : undefined)}
            onSuccess={(r) => {
              const t = r.data as TemplateRecord;
              setSubject(t.subject);
              setHtml(t.html ?? "");
              setText(t.text ?? "");
              setVars(t.variables.map((x) => ({ name: x.name, required: Boolean(x.required), example: exampleToText(x.example) })));
              setPanel(null);
              router.refresh();
            }}
          />

          {/* Send test email */}
          <Dialog open={panel === "test"} onOpenChange={(v) => !v && setPanel(null)}>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Send test email</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    const r = await sendTestTemplateAction(slug, template.name, testTo, data);
                    if (!r.ok) return toastResult(r);
                    const id = String(r.data);
                    toast.success(r.message ?? "Test email queued.", { action: { label: "View", onClick: () => router.push(p(slug, "emails", id)) } });
                    setPanel(null);
                  });
                }}
              >
                <DialogBody>
                  <Field label="To" htmlFor="test-to" description="Sent from the project's default sender with the example data. The saved version is used.">
                    <Input id="test-to" type="email" required autoFocus value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
                  </Field>
                </DialogBody>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" variant="primary" loading={pending}>
                    Send
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete */}
          <ConfirmDialog
            open={panel === "delete"}
            onOpenChange={(v) => !v && setPanel(null)}
            title={`Delete ${template.name}?`}
            body="All versions are deleted. Sends that use this name fall back to a built-in template with the same name, or fail."
            confirmLabel="Delete template"
            tone="danger"
            typeToConfirm={template.name}
            onConfirm={() => deleteTemplateAction(slug, template.name)}
            onSuccess={() => router.push(p(slug, "templates"))}
          />
        </>
      ) : null}
    </>
  );
}

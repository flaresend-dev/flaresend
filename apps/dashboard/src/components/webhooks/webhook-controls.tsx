"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCw, Send, Trash2 } from "lucide-react";
import { createWebhookAction, deleteWebhookAction, rotateWebhookSecretAction, setWebhookEnabledAction, testWebhookAction } from "@/app/actions";
import { useLink } from "@/lib/use-link";
import { useAutoOpen } from "@/lib/use-auto-open";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, MoreButton } from "@/components/ui/dropdown-menu";
import { FormDialog, SecretReveal } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch, SwitchField } from "@/components/ui/switch";
import { toastResult } from "@/components/ui/toast";
import { ProjectField, type PickerProject } from "@/components/project-field";
import { EventsPicker } from "./events-picker";

/** With `projects` (the "All projects" view, `slug` = ALL) the dialog asks which project the webhook is for. */
export function AddWebhookButton({ slug, projects, autoOpen = true }: { slug: string; projects?: PickerProject[]; autoOpen?: boolean }) {
  const [open, setOpen] = useAutoOpen("new", autoOpen);
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="primary">
          <Plus /> Add webhook
        </Button>
      }
      title="Add webhook"
      description="Flaresend POSTs a signed JSON body to this URL for each event you pick."
      action={createWebhookAction.bind(null, slug)}
      submitLabel="Add webhook"
      secretTitle="Copy your signing secret"
      size="lg"
    >
      {projects ? <ProjectField projects={projects} /> : null}
      <Field label="Endpoint URL" htmlFor="wh-url">
        <Input id="wh-url" name="url" type="url" required autoFocus placeholder="https://example.com/webhooks/flaresend" className="font-mono" />
      </Field>
      <EventsPicker selected={["*"]} />
      <SwitchField name="enabled" defaultChecked label="Enabled" description="Disabled webhooks keep their settings and receive nothing." />
    </FormDialog>
  );
}

/** Inline Enabled/Disabled switch in the webhooks table. */
export function WebhookEnabledSwitch({ slug, id, enabled }: { slug: string; id: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  return (
    <span className="relative z-10 inline-flex items-center gap-2">
      <Switch
        checked={on}
        disabled={pending}
        aria-label={on ? "Disable webhook" : "Enable webhook"}
        onCheckedChange={(v) => {
          setOn(v);
          start(async () => {
            const r = await setWebhookEnabledAction(slug, id, v, {}, new FormData());
            toastResult(r);
            if (!r.ok) setOn(!v);
          });
        }}
      />
      <span className="text-sm text-foreground-muted">{on ? "Enabled" : "Disabled"}</span>
    </span>
  );
}

/** Detail page header: Send test event, and ⋯ with Rotate signing secret / Delete. */
export function WebhookActions({ slug, id }: { slug: string; id: string }) {
  const to = useLink(slug);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "rotate" | "delete">(null);
  const [secret, setSecret] = useState<string | null>(null);
  const close = (v: boolean) => !v && setDialog(null);
  return (
    <>
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            toastResult(await testWebhookAction(slug, id, {}, new FormData()));
            router.refresh();
          })
        }
      >
        {pending ? null : <Send />} Send test event
      </Button>
      <DropdownMenu>
        <MoreButton className="size-8" />
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setDialog("rotate")}>
            <RotateCw /> Rotate signing secret…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem tone="danger" onSelect={() => setDialog("delete")}>
            <Trash2 /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RotateSecretDialog slug={slug} id={id} open={dialog === "rotate"} onOpenChange={close} onSecret={setSecret} />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title="Delete this webhook?"
        body="Its delivery history is deleted too. Your endpoint stops receiving events immediately."
        confirmLabel="Delete webhook"
        tone="danger"
        action={deleteWebhookAction.bind(null, slug, id)}
        onSuccess={() => router.push(to("webhooks"))}
      />
      <SecretReveal open={secret !== null} value={secret ?? ""} title="Copy your signing secret" onDone={() => setSecret(null)} />
    </>
  );
}

function RotateSecretDialog({ slug, id, open, onOpenChange, onSecret }: {
  slug: string;
  id: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSecret: (s: string) => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rotate the signing secret?"
      body="The old secret stops working immediately. Update your endpoint with the new secret right away."
      confirmLabel="Rotate secret"
      tone="danger"
      successMessage=""
      action={rotateWebhookSecretAction.bind(null, slug, id)}
      onSuccess={(s) => s.secret && onSecret(s.secret)}
    />
  );
}

/** The "Rotate" button on the Signing card. */
export function RotateSecretButton({ slug, id }: { slug: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <RotateCw /> Rotate
      </Button>
      <RotateSecretDialog slug={slug} id={id} open={open} onOpenChange={setOpen} onSecret={setSecret} />
      <SecretReveal open={secret !== null} value={secret ?? ""} title="Copy your signing secret" onDone={() => setSecret(null)} />
    </>
  );
}

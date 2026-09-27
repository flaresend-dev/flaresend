"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Copy, RotateCw, ScrollText, XCircle } from "lucide-react";
import { cancelEmailAction, rescheduleEmailAction, resendEmailAction } from "@/app/actions";
import { isoToLocalInput } from "@/lib/format";
import { p } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, MoreButton } from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

function RescheduleDialog({ slug, id, scheduledAt, open, onOpenChange }: { slug: string; id: string; scheduledAt: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reschedule email"
      description="Pick a new send time. It is in your local time zone."
      action={rescheduleEmailAction.bind(null, slug, id)}
      submitLabel="Reschedule"
      size="sm"
    >
      <Field label="Send at" htmlFor="r-at">
        <Input id="r-at" type="datetime-local" name="scheduledAt" defaultValue={isoToLocalInput(scheduledAt)} required />
      </Field>
    </FormDialog>
  );
}

function CancelDialog({ slug, id, open, onOpenChange }: { slug: string; id: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel this scheduled email?"
      body="It will not be sent. This cannot be undone; send it again to schedule a new copy."
      confirmLabel="Cancel email"
      tone="danger"
      action={cancelEmailAction.bind(null, slug, id)}
    />
  );
}

/** Header actions on the email detail page: Resend, and the ⋯ menu. */
export function EmailActions({ slug, id, scheduled, scheduledAt }: { slug: string; id: string; scheduled: boolean; scheduledAt: string | null }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "resend" | "reschedule" | "cancel">(null);
  const close = (v: boolean) => !v && setDialog(null);
  return (
    <>
      <Button variant="secondary" onClick={() => setDialog("resend")}>
        <RotateCw /> Resend
      </Button>
      <DropdownMenu>
        <MoreButton className="size-8" />
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={async () => {
              try {
                await navigator.clipboard.writeText(id);
                toast.success("Copied");
              } catch {
                toast.error("Could not copy.");
              }
            }}
          >
            <Copy /> Copy email ID
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(`${p(slug, "logs")}?emailId=${encodeURIComponent(id)}`)}>
            <ScrollText /> View in Logs
          </DropdownMenuItem>
          {scheduled ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDialog("reschedule")}>
                <CalendarClock /> Reschedule…
              </DropdownMenuItem>
              <DropdownMenuItem tone="danger" onSelect={() => setDialog("cancel")}>
                <XCircle /> Cancel
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === "resend"}
        onOpenChange={close}
        title="Send this email again as a new email?"
        body="A copy with the same content and recipients is queued now. The original is not changed."
        confirmLabel="Resend"
        action={resendEmailAction.bind(null, slug, id)}
        successMessage=""
        onSuccess={(s) => {
          const newId = String(s.data);
          toast.success("Sent again as a new email.", { action: { label: "View", onClick: () => router.push(p(slug, "emails", newId)) } });
        }}
      />
      <RescheduleDialog slug={slug} id={id} scheduledAt={scheduledAt} open={dialog === "reschedule"} onOpenChange={close} />
      <CancelDialog slug={slug} id={id} open={dialog === "cancel"} onOpenChange={close} />
    </>
  );
}

/** Buttons inside the violet "Scheduled for …" banner. */
export function ScheduledActions({ slug, id, scheduledAt }: { slug: string; id: string; scheduledAt: string | null }) {
  const [dialog, setDialog] = useState<null | "reschedule" | "cancel">(null);
  const close = (v: boolean) => !v && setDialog(null);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setDialog("reschedule")}>
        Reschedule
      </Button>
      <Button size="sm" variant="danger" onClick={() => setDialog("cancel")}>
        Cancel
      </Button>
      <RescheduleDialog slug={slug} id={id} scheduledAt={scheduledAt} open={dialog === "reschedule"} onOpenChange={close} />
      <CancelDialog slug={slug} id={id} open={dialog === "cancel"} onOpenChange={close} />
    </>
  );
}

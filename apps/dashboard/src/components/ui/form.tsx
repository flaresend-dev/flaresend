"use client";

import * as React from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { TriangleAlert } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import type { FormAction } from "@/lib/action-types";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";
import { CopyButton } from "./code";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";
import { toastError, toastSuccess } from "./toast";

export type { FormAction };

/**
 * A <form> bound to a server action. On success the action's `message` becomes a success toast; on error the
 * `code: message` string is shown inline and as an error toast. A one-time secret opens SecretReveal.
 */
export function ActionForm({
  action, children, footer, className, statusClassName, resetOnSuccess = false, onSuccess, toast = true, revealSecret = true, secretTitle, id,
}: {
  action: FormAction;
  children: React.ReactNode;
  /** Rendered after the inline error, so the error sits above the buttons. */
  footer?: React.ReactNode;
  statusClassName?: string;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  /** false: the caller shows its own success feedback (errors are always toasted). */
  toast?: boolean;
  revealSecret?: boolean;
  secretTitle?: string;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  const lastSeq = useRef<number | undefined>(undefined);
  const [secret, setSecret] = useState<string | null>(null);
  const cb = useRef(onSuccess);
  cb.current = onSuccess;

  useEffect(() => {
    if (state.seq === undefined || state.seq === lastSeq.current) return;
    lastSeq.current = state.seq;
    if (state.error) {
      toastError(state.error);
      return;
    }
    if (!state.ok) return;
    if (toast && state.message) toastSuccess(state.message);
    if (resetOnSuccess) ref.current?.reset();
    if (state.secret && revealSecret) setSecret(state.secret);
    cb.current?.(state);
  }, [state, toast, resetOnSuccess, revealSecret]);

  return (
    <>
      <form ref={ref} id={id} action={formAction} className={cn("flex flex-col gap-4", className)}>
        {children}
        <ActionStatus state={state} className={statusClassName} />
        {footer}
      </form>
      {revealSecret ? <SecretReveal open={secret !== null} value={secret ?? ""} title={secretTitle ?? state.secretLabel ?? "Copy your secret"} onDone={() => setSecret(null)} /> : null}
    </>
  );
}

/** Inline error for a form. Success is shown as a toast, not here. */
export function ActionStatus({ state, className }: { state: ActionState; className?: string }) {
  if (!state.error) return null;
  return (
    <p role="alert" className={cn("w-full break-all rounded-md border border-danger-border bg-danger-bg px-2.5 py-1.5 font-mono text-xs text-danger-fg", className)}>
      {state.error}
    </p>
  );
}

export function SubmitButton({ children, variant = "primary", ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} {...props}>
      {children}
    </Button>
  );
}

/**
 * The one-time key/secret box (section 5.5). It cannot be closed by clicking outside or pressing Esc: the user
 * has to press Done.
 */
export function SecretReveal({ open, value, title, onDone, description }: {
  open: boolean;
  value: string;
  title: string;
  onDone: () => void;
  description?: React.ReactNode;
}) {
  return (
    <Dialog open={open}>
      <DialogContent dismissible={false} size="lg">
        <DialogHeader className="pr-5">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>
          <div className="flex items-center gap-2 rounded-md border border-border-strong bg-background-subtle py-1 pr-1 pl-3">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-xs text-foreground">{value}</code>
            <CopyButton value={value} label="Copy" />
          </div>
          <p className="flex items-center gap-2 text-xs text-warning-fg">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            This is the only time it will be shown.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A button that opens a dialog with a form. On success the dialog closes; if the action returned a secret the
 * SecretReveal dialog opens instead; with `successView` the dialog shows that view with a Done button.
 */
export function FormDialog({
  trigger, open: openProp, onOpenChange, title, description, action, submitLabel, submitVariant = "primary", children, onSuccess,
  secretTitle, successView, toast = true, size = "md", submitDisabled,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  action: FormAction;
  submitLabel: string;
  submitVariant?: ButtonProps["variant"];
  children: React.ReactNode;
  onSuccess?: (state: ActionState) => void;
  secretTitle?: string;
  successView?: (state: ActionState) => React.ReactNode;
  toast?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  submitDisabled?: boolean;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOpenState(v);
    onOpenChange?.(v);
    if (!v) setDone(null);
  };
  const [done, setDone] = useState<ActionState | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
        <DialogContent size={size}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && !done ? <DialogDescription asChild><div>{description}</div></DialogDescription> : null}
          </DialogHeader>
          {done && successView ? (
            <>
              <DialogBody>{successView(done)}</DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="primary">Done</Button>
                </DialogClose>
              </DialogFooter>
            </>
          ) : (
            <ActionForm
              action={action}
              toast={toast}
              revealSecret={false}
              className="min-h-0 gap-0"
              statusClassName="mx-5 mt-3 w-auto"
              footer={
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <SubmitButton variant={submitVariant} disabled={submitDisabled}>
                    {submitLabel}
                  </SubmitButton>
                </DialogFooter>
              }
              onSuccess={(s) => {
                onSuccess?.(s);
                if (s.secret) {
                  setOpen(false);
                  setSecret(s.secret);
                } else if (successView) setDone(s);
                else setOpen(false);
              }}
            >
              <DialogBody className="pb-1">{children}</DialogBody>
            </ActionForm>
          )}
        </DialogContent>
      </Dialog>
      <SecretReveal open={secret !== null} value={secret ?? ""} title={secretTitle ?? "Copy your secret"} onDone={() => setSecret(null)} />
    </>
  );
}

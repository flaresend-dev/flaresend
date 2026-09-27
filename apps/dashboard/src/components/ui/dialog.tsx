"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import type { FormAction } from "@/lib/action-types";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import { toastError, toastSuccess } from "./toast";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIZES = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" } as const;

export function DialogContent({ className, children, size = "md", dismissible = true, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: keyof typeof SIZES;
  /** false: outside clicks and Esc do nothing and there is no × (the one-time secret dialog). */
  dismissible?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fs-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
        onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
        className={cn(
          "fs-pop fixed top-[12vh] left-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background-elevated text-foreground shadow-pop outline-none",
          SIZES[size],
          className,
        )}
        {...props}
      >
        {children}
        {dismissible ? (
          <DialogPrimitive.Close className="absolute top-3.5 right-3.5 rounded-md p-1 text-foreground-subtle transition-colors hover:bg-background-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5 pr-12 pb-3", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-section font-semibold", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-foreground-muted", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-2", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background-subtle px-5 py-3", className)} {...props} />;
}

/**
 * Replaces the browser confirm() box. Runs `action` (a bound server action) or `onConfirm` when the user confirms, shows the
 * result as a toast, and closes on success. `typeToConfirm` makes the user type a value (key name, slug) first.
 */
export function ConfirmDialog({
  trigger, open: openProp, onOpenChange, title, body, confirmLabel = "Confirm", tone, typeToConfirm, action, onConfirm, onSuccess,
  successMessage,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  body?: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger";
  typeToConfirm?: string;
  action?: FormAction;
  onConfirm?: () => Promise<ActionState | void> | ActionState | void;
  onSuccess?: (state: ActionState) => void;
  /** Toast text on success; defaults to the action's own message. */
  successMessage?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOpenState(v);
    onOpenChange?.(v);
  };
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blocked = Boolean(typeToConfirm) && typed !== typeToConfirm;

  const confirm = () =>
    start(async () => {
      const r: ActionState = (action ? await action({}, new FormData()) : ((await onConfirm?.()) ?? { ok: true })) as ActionState;
      if (r.error) {
        setError(r.error);
        toastError(r.error);
        return;
      }
      const msg = successMessage ?? r.message;
      if (msg) toastSuccess(msg);
      setOpen(false);
      onSuccess?.(r);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setTyped("");
          setError(null);
        }
        setOpen(v);
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body ? <DialogDescription asChild><div>{body}</div></DialogDescription> : null}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!blocked) confirm();
          }}
        >
          {typeToConfirm || error ? (
            <DialogBody>
              {typeToConfirm ? (
                <label className="flex flex-col gap-1.5 text-xs text-foreground-muted">
                  <span>
                    Type <span className="font-mono font-medium text-foreground">{typeToConfirm}</span> to confirm.
                  </span>
                  <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
                </label>
              ) : null}
              {error ? <p role="alert" className="break-all rounded-md border border-danger-border bg-danger-bg px-2.5 py-1.5 font-mono text-xs text-danger-fg">{error}</p> : null}
            </DialogBody>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} loading={pending} disabled={blocked} autoFocus={!typeToConfirm}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

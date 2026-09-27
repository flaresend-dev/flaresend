"use client";

import { Toaster as Sonner, toast } from "sonner";
import type { ActionState } from "@/lib/action-state";

export { toast };

/** Mounted once in the root layout. Styled with the tokens so it follows light/dark. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[356px] max-w-[calc(100vw-32px)] items-start gap-2.5 rounded-lg border border-border bg-background-elevated px-4 py-3 text-sm text-foreground shadow-pop",
          title: "font-medium leading-5",
          description: "mt-0.5 break-words text-xs text-foreground-muted",
          icon: "mt-0.5 [&_svg]:size-4",
          success: "[&_[data-icon]]:text-success-fg",
          error: "border-danger-border [&_[data-icon]]:text-danger-fg [&_[data-title]]:break-all [&_[data-title]]:font-mono [&_[data-title]]:text-xs [&_[data-title]]:font-normal",
          actionButton:
            "ml-auto shrink-0 self-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/85",
          closeButton:
            "!left-auto !right-1 !top-1 !translate-x-0 !translate-y-0 !border-0 !bg-transparent text-foreground-subtle hover:!text-foreground",
        },
      }}
    />
  );
}

/** Success: short and self-dismissing. */
export function toastSuccess(message: string, opts?: { action?: { label: string; onClick: () => void } }) {
  toast.success(message, opts?.action ? { action: opts.action } : undefined);
}

/** Errors show the `code: message` string and stay until dismissed. */
export function toastError(message: string) {
  toast.error(message, { duration: Infinity, closeButton: true });
}

/** Surfaces a server action result. `success` overrides the action's own message. */
export function toastResult(r: ActionState, success?: string) {
  if (r.error) toastError(r.error);
  else if (r.ok && (success ?? r.message)) toastSuccess(success ?? r.message!);
}

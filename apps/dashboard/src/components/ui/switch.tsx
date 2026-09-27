"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * On/off control for boolean settings. Inside a <form> it submits `name=on` when on and nothing when off, which is
 * what the server actions' `bool()` reads.
 */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-150",
        "bg-border-strong data-[state=checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background-elevated shadow-sm ring-0 transition-transform duration-150 data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

/** A switch with its label and hint on the left, as used on the Settings page. */
export function SwitchField({ label, description, id, className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  const auto = React.useId();
  const switchId = id ?? auto;
  return (
    <div className={cn("flex items-start justify-between gap-6", className)}>
      <label htmlFor={switchId} className="flex min-w-0 cursor-pointer flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description ? <span className="text-xs text-foreground-muted">{description}</span> : null}
      </label>
      <Switch id={switchId} className="mt-0.5" {...props} />
    </div>
  );
}

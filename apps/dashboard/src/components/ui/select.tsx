"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  /** Muted second line in the list (not shown in the trigger). */
  description?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Radix Select with a flat options list. With `name` it also submits inside a <form>.
 * Radix does not allow "" as an item value, so use a real value (e.g. "all") for "no filter".
 */
export function Select({ options, value, defaultValue, onValueChange, name, placeholder, disabled, required, className, contentClassName, ariaLabel, icon }: {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange} name={name} disabled={disabled} required={required}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-background-elevated px-2.5 text-sm text-foreground shadow-card",
          "transition-colors hover:bg-background-hover focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-foreground-subtle [&_svg]:size-4 [&_svg]:shrink-0",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate [&_svg]:text-foreground-muted">
          {icon}
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="text-foreground-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "fs-pop z-50 max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-background-elevated p-1 text-sm text-foreground shadow-pop",
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex min-h-8 cursor-default select-none flex-col justify-center rounded-md py-1.5 pr-8 pl-2 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-background-hover"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                {o.description ? <span className="text-xs text-foreground-muted">{o.description}</span> : null}
                <SelectPrimitive.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Check className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

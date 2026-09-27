"use client";

import * as React from "react";
import { DropdownMenu as Menu } from "radix-ui";
import { Check, Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/**
 * Non-modal by default, so a menu item can open a Dialog without Radix leaving `pointer-events: none` on <body>.
 */
export function DropdownMenu({ modal = false, ...props }: React.ComponentProps<typeof Menu.Root>) {
  return <Menu.Root modal={modal} {...props} />;
}

export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "fs-pop z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-background-elevated p-1 text-sm text-foreground shadow-pop",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const itemClass =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 outline-none transition-colors " +
  "data-[highlighted]:bg-background-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50 " +
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-foreground-muted";

export function DropdownMenuItem({ className, tone, ...props }: React.ComponentProps<typeof Menu.Item> & { tone?: "danger" }) {
  return <Menu.Item className={cn(itemClass, tone === "danger" && "text-danger-fg [&_svg]:text-danger-fg", className)} {...props} />;
}

export function DropdownMenuCheckItem({ className, checked, children, ...props }: React.ComponentProps<typeof Menu.Item> & { checked?: boolean }) {
  return (
    <Menu.Item className={cn(itemClass, "pr-8", className)} {...props}>
      {children}
      {checked ? <Check className="absolute right-2 !text-foreground" aria-hidden /> : null}
    </Menu.Item>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2 pt-1.5 pb-1 text-xs font-medium text-foreground-subtle", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

/** The `⋯` button used for row and page overflow menus. */
export function MoreButton({ label = "More actions", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <Menu.Trigger asChild>
      <button type="button" aria-label={label} className={buttonVariants({ variant: "ghost", size: "icon-sm", className })} {...props}>
        <Ellipsis />
      </button>
    </Menu.Trigger>
  );
}

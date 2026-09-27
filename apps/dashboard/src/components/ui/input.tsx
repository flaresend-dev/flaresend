import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full min-w-0 rounded-md border border-border-strong bg-background-elevated text-sm text-foreground " +
  "placeholder:text-foreground-subtle transition-colors duration-150 " +
  "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-background-subtle aria-invalid:border-danger-fg";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  /** Rendered inside the field on the left (an icon, or text like `fs_live_`). */
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, prefix, suffix, ...props }: InputProps) {
  if (!prefix && !suffix) return <input className={cn(fieldClass, "h-8 px-2.5", className)} {...props} />;
  return (
    <div className={cn("relative flex items-center", className)}>
      {prefix ? (
        <span className="pointer-events-none absolute left-2.5 flex items-center text-foreground-subtle [&_svg]:size-4">{prefix}</span>
      ) : null}
      <input className={cn(fieldClass, "h-8 px-2.5", prefix ? "pl-8" : null, suffix ? "pr-9" : null)} {...props} />
      {suffix ? <span className="absolute right-2 flex items-center text-foreground-subtle">{suffix}</span> : null}
    </div>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  return <textarea className={cn(fieldClass, "min-h-20 px-2.5 py-2 leading-relaxed", className)} {...props} />;
}

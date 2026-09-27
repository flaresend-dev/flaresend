import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium " +
    "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "border border-border-strong bg-background-elevated text-foreground shadow-card hover:bg-background-hover",
        ghost: "text-foreground-muted hover:bg-background-hover hover:text-foreground",
        danger: "bg-danger-solid text-white hover:bg-danger-solid/90",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-sm",
        lg: "h-9 px-4 text-sm",
        icon: "size-8",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonVariantProps = VariantProps<typeof variants>;

/** Button classes, for links and other elements that should look like a button. */
export function buttonVariants(opts: ButtonVariantProps & { className?: string } = {}): string {
  return cn(variants({ variant: opts.variant, size: opts.size }), opts.className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({ variant, size, loading, className, type = "button", disabled, children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** A next/link styled as a button. */
export function LinkButton({ href, variant, size, className, children, ...props }: React.ComponentProps<typeof Link> & ButtonVariantProps) {
  return (
    <Link href={href} className={buttonVariants({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}

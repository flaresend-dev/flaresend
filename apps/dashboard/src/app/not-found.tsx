import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-[96px] leading-none font-semibold tracking-tighter text-foreground-subtle/60 select-none">404</p>
      <h1 className="mt-4 text-title font-semibold">This page does not exist</h1>
      <p className="mt-1 text-sm text-foreground-muted">The link may be old, or the project or item was deleted.</p>
      <LinkButton href="/" variant="primary" className="mt-6">
        Go to Emails
      </LinkButton>
    </div>
  );
}

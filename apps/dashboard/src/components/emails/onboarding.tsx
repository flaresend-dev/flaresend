import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { ApiKeyRecord, DomainRecord, ProjectRecord } from "@flaresend/types";
import { p } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code";
import { Logo } from "@/components/shell/icons";

function snippet(project: ProjectRecord): string {
  const from = project.defaultFrom ?? `you@${project.allowedDomains[0] ?? "yourdomain.com"}`;
  return `import { Flaresend } from "@flaresend/client";

const flaresend = new Flaresend({
  apiKey: process.env.FLARESEND_API_KEY!,
  baseUrl: "https://mailer.yourdomain.com",
});

await flaresend.emails.send({
  from: ${JSON.stringify(from)},
  to: "you@example.com",
  subject: "Hello from Flaresend",
  html: "<p>It works.</p>",
});`;
}

function Step({ n, done, title, children, action }: { n: number; done: boolean; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      <span className="absolute top-8 bottom-1 left-[13px] w-px bg-border [li:last-child>&]:hidden" aria-hidden />
      <span
        className={cn(
          "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
          done ? "border-success-border bg-success-bg text-success-fg" : "border-border-strong bg-background-elevated text-foreground",
        )}
      >
        {done ? <Check className="size-3.5" strokeWidth={3} aria-label="Done" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={cn("text-sm font-semibold", done && "text-foreground-muted")}>{title}</h3>
          {action}
        </div>
        {children}
      </div>
    </li>
  );
}

/** Emails page when the project has never sent anything: three steps with live status. */
export function EmailsOnboarding({ project, domains, keys }: { project: ProjectRecord; domains: DomainRecord[] | null; keys: ApiKeyRecord[] | null }) {
  const hasDomain = project.allowedDomains.length > 0;
  const now = Date.now();
  const liveKey = (keys ?? []).some((k) => k.mode === "live" && !k.revokedAt && !(k.expiresAt && Date.parse(k.expiresAt) < now));
  const stepLink = (href: string, label: string) => (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground">
      {label} <ArrowRight className="size-3.5" />
    </Link>
  );

  return (
    <div className="mx-auto max-w-[640px] py-8 md:py-12">
      <div className="mb-10 flex flex-col items-center text-center">
        <Logo className="mb-5 size-10" />
        <h2 className="text-title font-semibold tracking-[-0.01em]">Send your first email</h2>
        <p className="mt-1.5 max-w-md text-sm text-foreground-muted">
          Three steps and {project.name} is sending. Every email you send shows up here with its delivery status.
        </p>
      </div>
      <ol>
        <Step n={1} done={hasDomain} title="Add a domain" action={stepLink(p(project.slug, "domains"), "Domains")}>
          <ul className="flex flex-col gap-1.5">
            {project.allowedDomains.map((d) => {
              const rec = domains?.find((x) => x.domain === d);
              return (
                <li key={d} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs">{d}</span>
                  {rec ? <StatusBadge status={rec.verification} /> : null}
                </li>
              );
            })}
          </ul>
        </Step>
        <Step n={2} done={liveKey} title="Create an API key" action={stepLink(`${p(project.slug, "api-keys")}${liveKey ? "" : "?new=1"}`, liveKey ? "API Keys" : "Create key")}>
          <p className="text-sm text-foreground-muted">
            {liveKey ? "You have an active live key." : "Your server uses a live key to send. Test keys record emails without sending them."}
          </p>
        </Step>
        <Step n={3} done={false} title="Send an email">
          <p className="text-sm text-foreground-muted">
            Install <code className="font-mono text-xs text-foreground">@flaresend/client</code> and point it at your mailer.
          </p>
          <CodeBlock code={snippet(project)} className="mt-1" />
        </Step>
      </ol>
    </div>
  );
}

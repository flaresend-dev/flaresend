import { mailerCall } from "@/lib/mailer";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/ui/code";

const HINT: Record<string, string> = {
  cf_token_missing: "Set the mailer's CF_API_TOKEN secret to show its URL.",
  cf_account_missing: "Set the mailer's CF_ACCOUNT_ID secret to show its URL.",
  cf_api_error: "Cloudflare refused the lookup. CF_API_TOKEN needs Account → Workers Scripts → Read.",
};

/**
 * The mailer's addresses as Cloudflare reports them: its custom domains first, then its workers.dev URL.
 * Read-only; it follows domain changes on the Worker without any config change.
 */
export async function MailerUrl({ className }: { className?: string }) {
  const info = await mailerCall((m) => m.info());
  if (!info.ok) {
    return (
      <span className={cn("text-xs text-foreground-muted", className)} title={info.error.message}>
        {HINT[info.error.code] ?? "Could not look up the mailer URL."}
      </span>
    );
  }
  if (info.data.urls.length === 0) {
    return <span className={cn("text-xs text-foreground-muted", className)}>The mailer Worker has no custom domain and workers.dev is off.</span>;
  }
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {info.data.urls.map(({ url, kind }, i) => (
        <span key={url} className="flex min-w-0 items-center gap-1">
          <code
            className={cn(
              "min-w-0 truncate rounded-sm border border-border bg-background-subtle px-1.5 py-0.5 font-mono text-xs",
              i > 0 && "text-foreground-muted",
            )}
            title={kind === "custom_domain" ? "Custom domain" : "workers.dev"}
          >
            {url}
          </code>
          <CopyButton value={url} label="Copy mailer URL" toastLabel="Mailer URL copied" className="size-7 shrink-0 [&_svg]:size-3.5" />
        </span>
      ))}
    </span>
  );
}

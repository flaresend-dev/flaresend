import { KeyRound } from "lucide-react";
import type { ApiKeyRecord } from "@flaresend/types";
import { mailerCall } from "@/lib/mailer";
import type { SlugParams } from "@/lib/project";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";
import { MailerUrl } from "@/components/mailer-url";
import { CreateApiKeyButton } from "@/components/api-keys/create-api-key";
import { KeyActions } from "@/components/api-keys/key-actions";

export const metadata = { title: "API Keys" };

const DAY = 86_400_000;

function LastUsed({ k, now }: { k: ApiKeyRecord; now: number }) {
  if (k.revokedAt) return <StatusBadge status="revoked" />;
  if (k.expiresAt && Date.parse(k.expiresAt) < now) return <StatusBadge status="expired" />;
  if (!k.lastUsedAt) {
    return (
      <span className="flex items-center gap-2 text-foreground-muted">
        <span className="size-2 rounded-full border border-foreground-subtle" aria-hidden />
        Never
      </span>
    );
  }
  const recent = now - Date.parse(k.lastUsedAt) < DAY;
  return (
    <span className="flex items-center gap-2">
      {recent ? <span className="size-2 rounded-full bg-success-fg" aria-label="Used in the last 24 hours" /> : null}
      <Time iso={k.lastUsedAt} className={recent ? undefined : "text-foreground-muted"} />
    </span>
  );
}

export default async function ApiKeysPage({ params }: SlugParams) {
  const { slug } = await params;
  const keys = await mailerCall((m) => m.listApiKeys(slug));
  const now = Date.now();

  return (
    <>
      <PageHeader title="API Keys" description="Keys let your servers send email for this project." actions={<CreateApiKeyButton slug={slug} />} />
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border px-4 py-3">
        <span className="text-xs font-medium">Mailer URL</span>
        <MailerUrl />
        <span className="text-xs text-foreground-muted">
          Use it as <code className="font-mono">baseUrl</code> in <code className="font-mono">@flaresend/client</code>, or send to{" "}
          <code className="font-mono">/v1/emails</code> on it.
        </span>
      </div>
      {!keys.ok ? (
        <PageError error={keys.error} title="Could not load API keys" />
      ) : keys.data.length === 0 ? (
        <EmptyState icon={<KeyRound />} title="Create an API key to start sending" action={<CreateApiKeyButton slug={slug} autoOpen={false} />}>
          The key is shown once. Store it in your server&apos;s environment as <code className="font-mono text-xs">FLARESEND_API_KEY</code>.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH className="w-[24%]">Name</TH>
              <TH className="w-[18%]">Token</TH>
              <TH className="w-[80px]">Mode</TH>
              <TH>Last used</TH>
              <TH className="hidden w-[130px] md:table-cell">Created</TH>
              <TH className="hidden w-[130px] md:table-cell">Expires</TH>
              <TH className="w-[52px]">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {keys.data.map((k) => {
              const revoked = Boolean(k.revokedAt);
              return (
                <tr key={k.id} className={cn("transition-colors hover:bg-background-hover", revoked && "text-foreground-muted")}>
                  <TD className={cn("truncate font-medium", revoked && "font-normal line-through decoration-foreground-subtle")}>{k.name}</TD>
                  <TD className="truncate font-mono text-xs">{k.prefix}…</TD>
                  <TD>
                    <Badge tone={k.mode === "live" ? "success" : "muted"}>{k.mode === "live" ? "Live" : "Test"}</Badge>
                  </TD>
                  <TD>
                    <LastUsed k={k} now={now} />
                  </TD>
                  <TD className="hidden text-foreground-muted md:table-cell">
                    <Time iso={k.createdAt} format="date" />
                  </TD>
                  <TD className="hidden text-foreground-muted md:table-cell">
                    {revoked ? "—" : k.expiresAt ? <Time iso={k.expiresAt} format="date" /> : "Never"}
                  </TD>
                  <TD className="text-right">
                    <KeyActions slug={slug} id={k.id} name={k.name} revoked={revoked} />
                  </TD>
                </tr>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}

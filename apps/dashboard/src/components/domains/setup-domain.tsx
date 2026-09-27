"use client";

import type { DomainSetupStep } from "@flaresend/types";
import { setupDomainAction, type DomainSetupView } from "@/app/actions";
import { Badge, Notice, StatusBadge } from "@/components/ui/badge";
import { FormDialog } from "@/components/ui/form";
import type { Tone } from "@/lib/labels";

const STEP_TONE: Record<DomainSetupStep["status"], Tone> = {
  created: "success",
  exists: "muted",
  conflict: "warning",
  skipped: "muted",
  failed: "danger",
};

const STEP_LABEL: Record<DomainSetupStep["status"], string> = {
  created: "Added",
  exists: "Already set",
  conflict: "Conflict",
  skipped: "Skipped",
  failed: "Failed",
};

/** The result of onboarding a domain in Cloudflare, one row per step. */
export function SetupResult({ view }: { view: DomainSetupView }) {
  if (!view.setup) {
    return (
      <Notice tone="danger" title="Cloudflare setup failed">
        {view.setupError}
        <p className="mt-1">The domain is added to this project. Fix the problem, then run Set up in Cloudflare from the domain&apos;s menu.</p>
      </Notice>
    );
  }
  const { setup } = view;
  const needsHand = setup.steps.some((s) => s.status === "conflict" || s.status === "failed");
  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-sm font-medium">{setup.domain}</p>
        <StatusBadge status={setup.record.verification} />
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {setup.steps.map((s, i) => (
          <li key={i} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium capitalize">{s.step}</span>
              <Badge tone={STEP_TONE[s.status]}>{STEP_LABEL[s.status]}</Badge>
            </div>
            {s.record ? (
              <p className="font-mono text-xs break-all text-foreground-muted">
                {s.record.type} {s.record.name} → {s.record.content}
              </p>
            ) : null}
            <p className="text-xs text-foreground-muted">{s.detail}</p>
          </li>
        ))}
      </ul>
      {needsHand ? (
        <Notice tone="warning">Some steps need you to fix them in the Cloudflare dashboard. Nothing already in DNS was changed.</Notice>
      ) : setup.record.verification !== "onboarded" ? (
        <p className="text-sm text-foreground-muted">Cloudflare checks the new DNS records itself. This usually takes 5 to 15 minutes. Press Verify to check again.</p>
      ) : null}
    </div>
  );
}

/** Onboards a domain that is already on the project. Running it again only fills in what is missing. */
export function SetupDomainDialog({ slug, domain, open, onOpenChange }: { slug: string; domain: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set up in Cloudflare"
      description={
        <>
          Adds <span className="font-mono">{domain}</span> to Cloudflare Email Sending, adds the DNS records it needs, adds a DMARC record if there is none,
          and sends its delivery events to the mailer. DNS records that already exist are never changed.
        </>
      }
      action={setupDomainAction.bind(null, slug, domain)}
      submitLabel="Set up"
      size="md"
      successView={(s) => <SetupResult view={s.data as DomainSetupView} />}
    >
      {null}
    </FormDialog>
  );
}

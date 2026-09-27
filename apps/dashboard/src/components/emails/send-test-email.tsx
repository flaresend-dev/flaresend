"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import type { DomainRecord } from "@flaresend/types";
import { sendTestEmailAction } from "@/app/actions";
import { p } from "@/lib/nav";
import { sendableDomains } from "@/lib/senders";
import { useAutoOpen } from "@/lib/use-auto-open";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Notice } from "@/components/ui/badge";
import { toastSuccess } from "@/components/ui/toast";

/**
 * Header action on Emails. Plain-text email from any verified domain of the project, starting from that domain's
 * default sender. `?send=1` opens it. `domains` is null when they could not be loaded.
 */
export function SendTestEmailButton({ slug, domains }: { slug: string; domains: DomainRecord[] | null }) {
  const router = useRouter();
  const [open, setOpen] = useAutoOpen("send");
  const { domains: senders, unchecked } = sendableDomains(domains ?? []);
  const [domain, setDomain] = useState(senders.find((d) => d.defaultFrom)?.domain ?? senders[0]?.domain ?? "");
  const current = senders.find((d) => d.domain === domain) ?? senders[0];
  const disabled = !current;

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="secondary">
          <Send /> Send test email
        </Button>
      }
      title="Send test email"
      action={sendTestEmailAction.bind(null, slug)}
      submitLabel="Send"
      submitDisabled={disabled}
      toast={false}
      onSuccess={(s) => {
        const id = String(s.data);
        toastSuccess(s.message ?? "Test email queued.", { action: { label: "View", onClick: () => router.push(p(slug, "emails", id)) } });
        router.refresh();
      }}
    >
      {domains === null ? (
        <Notice tone="danger" title="Could not load this project's domains">
          Reload the page to try again.
        </Notice>
      ) : disabled ? (
        <Notice tone="warning" title="No verified domain">
          Test emails are sent from a verified domain. Set one up in Domains, then press Verify.
        </Notice>
      ) : unchecked ? (
        <Notice tone="warning" title="Domains are not checked">
          The mailer cannot check verification with Cloudflare, so every domain is listed.
        </Notice>
      ) : null}
      {current ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Field label="Domain" htmlFor="t-domain">
            <Select
              ariaLabel="Domain"
              value={current.domain}
              onValueChange={setDomain}
              options={senders.map((d) => ({ value: d.domain, label: <span className="font-mono text-xs">{d.domain}</span> }))}
            />
          </Field>
          <Field label="From" htmlFor="t-from">
            {/* Keyed by domain so picking another domain starts from that domain's default sender. */}
            <Input
              key={current.domain}
              id="t-from"
              name="from"
              required
              defaultValue={current.defaultFrom ?? ""}
              placeholder={`hello@${current.domain}`}
            />
          </Field>
        </div>
      ) : null}
      <Field label="To" htmlFor="t-to">
        <Input id="t-to" name="to" type="email" required autoFocus placeholder="you@example.com" disabled={disabled} />
      </Field>
      <Field label="Subject" htmlFor="t-subject">
        <Input id="t-subject" name="subject" required defaultValue="Test email from Flaresend" disabled={disabled} />
      </Field>
      <Field label="Body" htmlFor="t-body">
        <Textarea id="t-body" name="body" required rows={5} defaultValue={"It works. This test was sent from the Flaresend dashboard."} disabled={disabled} />
      </Field>
    </FormDialog>
  );
}

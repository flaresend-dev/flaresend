"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AtSign, CloudCog, RefreshCw, Trash2 } from "lucide-react";
import type { DomainRecord } from "@flaresend/types";
import { removeDomainAction, setDomainSenderAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, MoreButton } from "@/components/ui/dropdown-menu";
import { DetailList, Sheet } from "@/components/ui/sheet";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { Tooltip } from "@/components/ui/tooltip";
import { SetupDomainDialog } from "./setup-domain";

/** Re-checks every domain with Cloudflare (the mailer's `?refresh=1`). */
export function VerifyButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return (
    <Button size={size} variant="secondary" loading={pending} onClick={() => start(() => router.push(`${pathname}?refresh=1`, { scroll: false }))}>
      {pending ? null : <RefreshCw />} Verify
    </Button>
  );
}

export function statusBadge(d: Pick<DomainRecord, "verification" | "details">) {
  const badge = <StatusBadge status={d.verification} />;
  if (d.verification !== "unknown") return badge;
  // The mailer stores Cloudflare API failures as { error } in details; no details at all means no token.
  const error = (d.details as { error?: unknown } | null | undefined)?.error;
  return (
    <Tooltip content={typeof error === "string" ? `The Cloudflare check failed: ${error}` : "The mailer has no CF_API_TOKEN, so it cannot check."}>
      <span className="relative z-10">{badge}</span>
    </Tooltip>
  );
}

/** The domain's sender, marked when it comes from the project default rather than the domain itself. */
function Sender({ d, own }: { d: DomainRecord; own: boolean }) {
  if (!d.defaultFrom) return <>—</>;
  return (
    <>
      {d.defaultFrom}
      {own ? null : <span className="text-foreground-subtle"> (project default)</span>}
    </>
  );
}

/** Sets or clears one domain's own default sender. */
function DomainSenderDialog({ slug, domain, current, onOpenChange }: {
  slug: string;
  domain: DomainRecord;
  current: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormDialog
      open
      onOpenChange={onOpenChange}
      title="Default sender"
      description={<>Used for <span className="font-mono text-foreground">{domain.domain}</span> when the dashboard sends from this domain.</>}
      action={setDomainSenderAction.bind(null, slug, domain.domain)}
      submitLabel="Save"
    >
      <Field
        label="Sender"
        htmlFor="domain-sender"
        description={`An address on ${domain.domain}, with an optional name. Leave empty to use the project default when it is on this domain.`}
      >
        <Input id="domain-sender" name="sender" autoFocus defaultValue={current ?? ""} placeholder={`Name <hello@${domain.domain}>`} />
      </Field>
    </FormDialog>
  );
}

export function DomainsTable({ slug, domains, domainSenders }: { slug: string; domains: DomainRecord[]; domainSenders: Record<string, string> }) {
  const [open, setOpen] = useState<DomainRecord | null>(null);
  const [editingSender, setEditingSender] = useState<DomainRecord | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState<string | null>(null);
  const last = domains.length <= 1;

  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH className="w-[30%]">Domain</TH>
            <TH className="w-[140px]">Status</TH>
            <TH className="hidden md:table-cell">Default sender</TH>
            <TH className="w-[110px]">Checked</TH>
            <TH className="w-[124px]">
              <span className="sr-only">Actions</span>
            </TH>
          </tr>
        </THead>
        <TBody>
          {domains.map((d) => (
            <tr
              key={d.domain}
              className="cursor-pointer transition-colors hover:bg-background-hover"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button,a,[role=menu]")) return;
                setOpen(d);
              }}
            >
              <TD className="truncate font-mono text-xs">
                <button type="button" className="truncate text-left hover:underline" onClick={() => setOpen(d)}>
                  {d.domain}
                </button>
              </TD>
              <TD>{statusBadge(d)}</TD>
              <TD className="hidden truncate text-foreground-muted md:table-cell">
                <Sender d={d} own={d.domain in domainSenders} />
              </TD>
              <TD className="text-foreground-muted">
                <Time iso={d.checkedAt ?? null} />
              </TD>
              <TD>
                <span className="flex items-center justify-end gap-1">
                  <VerifyButton />
                  <DropdownMenu>
                    <MoreButton label={`Actions for ${d.domain}`} />
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditingSender(d)}>
                        <AtSign /> Default sender…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSettingUp(d.domain)}>
                        <CloudCog /> Set up in Cloudflare
                      </DropdownMenuItem>
                      <DropdownMenuItem tone="danger" onSelect={() => setRemoving(d.domain)}>
                        <Trash2 /> Remove…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)} title={<span className="font-mono">{open?.domain}</span>} description="Verification details from Cloudflare Email Sending.">
        {open ? (
          <div className="flex flex-col gap-5">
            <DetailList
              items={[
                ["Status", statusBadge(open)],
                [
                  "Default sender",
                  <span key="s" className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate"><Sender d={open} own={open.domain in domainSenders} /></span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingSender(open);
                        setOpen(null);
                      }}
                    >
                      Edit
                    </Button>
                  </span>,
                ],
                ["Checked", <Time key="c" iso={open.checkedAt ?? null} format="absolute" />],
              ]}
            />
            {open.verification !== "onboarded" ? (
              <div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSettingUp(open.domain);
                    setOpen(null);
                  }}
                >
                  <CloudCog /> Set up in Cloudflare
                </Button>
              </div>
            ) : null}
            {open.details ? (
              <CodeBlock code={JSON.stringify(open.details, null, 2)} maxHeight="60vh" />
            ) : (
              <p className="text-sm text-foreground-muted">No details. Press Verify to check with Cloudflare now.</p>
            )}
          </div>
        ) : null}
      </Sheet>

      {editingSender ? (
        <DomainSenderDialog
          slug={slug}
          domain={editingSender}
          current={domainSenders[editingSender.domain] ?? null}
          onOpenChange={(v) => !v && setEditingSender(null)}
        />
      ) : null}

      {settingUp ? <SetupDomainDialog slug={slug} domain={settingUp} open onOpenChange={(v) => !v && setSettingUp(null)} /> : null}

      {removing && last ? (
        <Dialog open onOpenChange={(v) => !v && setRemoving(null)}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>You can&apos;t remove the last domain</DialogTitle>
              <DialogDescription>A project needs at least one domain to send from. Add another domain first, then remove {removing}.</DialogDescription>
            </DialogHeader>
            <DialogBody />
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="primary">OK</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(v) => !v && setRemoving(null)}
          title={`Remove ${removing ?? ""}?`}
          body="Emails from this domain will be rejected. The domain stays onboarded in Cloudflare."
          confirmLabel="Remove domain"
          tone="danger"
          action={removing ? removeDomainAction.bind(null, slug, removing) : undefined}
        />
      )}
    </>
  );
}

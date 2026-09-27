"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { ContactRecord } from "@flaresend/types";
import { addContactAction, deleteContactAction, updateContactAction } from "@/app/actions";
import { useAutoOpen } from "@/lib/use-auto-open";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ActionForm, FormDialog, SubmitButton } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DetailList, Sheet } from "@/components/ui/sheet";
import { SwitchField } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { Time } from "@/components/ui/time";

/** Controlled "Subscribed" switch that submits the action's `unsubscribed` field. */
function SubscribedSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <>
      <SwitchField checked={on} onCheckedChange={setOn} label="Subscribed" description="Unsubscribed contacts are skipped by every broadcast." />
      <input type="hidden" name="unsubscribed" value={on ? "false" : "true"} />
    </>
  );
}

export function AddContactButton({ slug, autoOpen = true }: { slug: string; autoOpen?: boolean }) {
  const [open, setOpen] = useAutoOpen("new", autoOpen);
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="primary">
          <UserPlus /> Add contact
        </Button>
      }
      title="Add contact"
      description="If the email already exists, that contact is updated."
      action={addContactAction.bind(null, slug)}
      submitLabel="Add contact"
    >
      <Field label="Email" htmlFor="c-email">
        <Input id="c-email" name="email" type="email" required autoFocus placeholder="ada@example.com" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="c-first" optional>
          <Input id="c-first" name="firstName" />
        </Field>
        <Field label="Last name" htmlFor="c-last" optional>
          <Input id="c-last" name="lastName" />
        </Field>
      </div>
      <SubscribedSwitch initial />
    </FormDialog>
  );
}

function ContactSheet({ slug, contact, onClose }: { slug: string; contact: ContactRecord | null; onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <Sheet
        open={contact !== null}
        onOpenChange={(v) => !v && onClose()}
        title="Contact"
        description={contact ? <span className="font-mono text-xs">{contact.email}</span> : undefined}
      >
        {contact ? (
          <div className="flex flex-col gap-6">
            <ActionForm
              key={contact.id + contact.updatedAt}
              action={updateContactAction.bind(null, slug, contact.id)}
              footer={
                <div className="flex justify-end">
                  <SubmitButton>Save</SubmitButton>
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="cs-first">
                  <Input id="cs-first" name="firstName" defaultValue={contact.firstName ?? ""} />
                </Field>
                <Field label="Last name" htmlFor="cs-last">
                  <Input id="cs-last" name="lastName" defaultValue={contact.lastName ?? ""} />
                </Field>
              </div>
              <SubscribedSwitch initial={!contact.unsubscribed} />
            </ActionForm>
            <DetailList
              className="border-t border-border pt-5"
              items={[
                ["Added", <Time key="a" iso={contact.createdAt} format="absolute" />],
                ["Updated", <Time key="u" iso={contact.updatedAt} format="absolute" />],
              ]}
            />
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground-muted">Data</h3>
              {contact.data && Object.keys(contact.data).length ? (
                <CodeBlock code={JSON.stringify(contact.data, null, 2)} maxHeight="40vh" />
              ) : (
                <p className="text-sm text-foreground-muted">No extra data. CSV columns other than the known ones end up here.</p>
              )}
            </div>
            <button type="button" className="w-fit text-sm font-medium text-danger-fg hover:underline" onClick={() => setConfirmDelete(true)}>
              Delete contact
            </button>
          </div>
        ) : null}
      </Sheet>
      {contact ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${contact.email}?`}
          body="They are also removed from every audience. This cannot be undone."
          confirmLabel="Delete contact"
          tone="danger"
          action={deleteContactAction.bind(null, slug, contact.id)}
          onSuccess={onClose}
        />
      ) : null}
    </>
  );
}

/** Contacts table; a row opens the contact in a sheet. */
export function ContactsTable({ slug, contacts }: { slug: string; contacts: ContactRecord[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Follows server refreshes after a save.
  const open = contacts.find((c) => c.id === openId) ?? null;
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Email</TH>
            <TH className="hidden w-[28%] md:table-cell">Name</TH>
            <TH className="w-[140px]">Status</TH>
            <TH className="w-[110px] text-right">Added</TH>
          </tr>
        </THead>
        <TBody>
          {contacts.map((c) => (
            <tr
              key={c.id}
              tabIndex={0}
              className="cursor-pointer transition-colors hover:bg-background-hover focus-visible:bg-background-hover focus-visible:outline-none"
              onClick={() => setOpenId(c.id)}
              onKeyDown={(e) => e.key === "Enter" && setOpenId(c.id)}
            >
              <TD className="truncate font-mono text-xs">{c.email}</TD>
              <TD className="hidden truncate md:table-cell">{[c.firstName, c.lastName].filter(Boolean).join(" ") || <span className="text-foreground-subtle">—</span>}</TD>
              <TD>
                <StatusBadge status={c.unsubscribed ? "unsubscribed" : "subscribed"} />
              </TD>
              <TD className="text-right text-foreground-muted">
                <Time iso={c.createdAt} />
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>
      <ContactSheet slug={slug} contact={open} onClose={() => setOpenId(null)} />
    </>
  );
}

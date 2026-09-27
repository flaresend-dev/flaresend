"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addSuppressionAction, removeSuppressionAction } from "@/app/actions";
import { SUPPRESSION_REASONS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, MoreButton } from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function AddSuppressionButton({ slug }: { slug: string }) {
  return (
    <FormDialog
      trigger={
        <Button variant="primary">
          <Plus /> Add address
        </Button>
      }
      title="Add address"
      description="Flaresend will refuse to send to this address from every project."
      action={addSuppressionAction.bind(null, slug)}
      submitLabel="Add address"
      size="sm"
    >
      <Field label="Address" htmlFor="sup-address">
        <Input id="sup-address" name="address" type="email" required autoFocus placeholder="someone@example.com" />
      </Field>
      <Field label="Reason">
        <Select
          name="reason"
          defaultValue="manual"
          ariaLabel="Reason"
          options={Object.entries(SUPPRESSION_REASONS).map(([value, label]) => ({ value, label }))}
        />
      </Field>
    </FormDialog>
  );
}

export function SuppressionMenu({ slug, address }: { slug: string; address: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <MoreButton label={`Actions for ${address}`} />
        <DropdownMenuContent>
          <DropdownMenuItem tone="danger" onSelect={() => setOpen(true)}>
            <Trash2 /> Remove…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${address}?`}
        body={`Flaresend will send to ${address} again.`}
        confirmLabel="Remove"
        tone="danger"
        action={removeSuppressionAction.bind(null, slug, address)}
      />
    </>
  );
}

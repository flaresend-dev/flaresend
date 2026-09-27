"use client";

import { useState } from "react";
import { Ban, Pencil } from "lucide-react";
import { renameApiKeyAction, revokeApiKeyAction } from "@/app/actions";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, MoreButton } from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Row ⋯ menu: Rename…, Revoke… (type the key name to confirm). */
export function KeyActions({ slug, id, name, revoked }: { slug: string; id: string; name: string; revoked: boolean }) {
  const [dialog, setDialog] = useState<null | "rename" | "revoke">(null);
  const close = (v: boolean) => !v && setDialog(null);
  if (revoked) return null;
  return (
    <>
      <DropdownMenu>
        <MoreButton label={`Actions for ${name}`} />
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil /> Rename…
          </DropdownMenuItem>
          <DropdownMenuItem tone="danger" onSelect={() => setDialog("revoke")}>
            <Ban /> Revoke…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormDialog open={dialog === "rename"} onOpenChange={close} title="Rename API key" action={renameApiKeyAction.bind(null, slug, id)} submitLabel="Save" size="sm">
        <Field label="Name" htmlFor={`rn-${id}`}>
          <Input id={`rn-${id}`} name="name" defaultValue={name} required autoFocus />
        </Field>
      </FormDialog>
      <ConfirmDialog
        open={dialog === "revoke"}
        onOpenChange={close}
        title={`Revoke ${name}?`}
        body="Anything using it will start getting 401 errors. This cannot be undone."
        confirmLabel="Revoke key"
        tone="danger"
        typeToConfirm={name}
        action={revokeApiKeyAction.bind(null, slug, id)}
      />
    </>
  );
}

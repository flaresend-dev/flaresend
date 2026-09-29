"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createAudienceAction, deleteAudienceAction, renameAudienceAction } from "@/app/actions";
import { ALL } from "@/lib/nav";
import { useLink } from "@/lib/use-link";
import { ProjectField, type PickerProject } from "@/components/project-field";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, MoreButton } from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** With `projects` (the "All projects" view, `slug` = ALL) the dialog asks which project the audience is for. */
export function NewAudienceButton({ slug, projects }: { slug: string; projects?: PickerProject[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState(projects?.find((pr) => !pr.disabledAt)?.slug ?? projects?.[0]?.slug ?? "");
  const to = useLink(slug === ALL ? picked : slug);
  return (
    <FormDialog
      trigger={
        <Button variant="primary">
          <Plus /> New audience
        </Button>
      }
      title="New audience"
      description="A named list of contacts. A broadcast goes to one audience."
      action={createAudienceAction.bind(null, slug)}
      submitLabel="Create audience"
      size="sm"
      onSuccess={(s) => router.push(to("audiences", String(s.data)))}
    >
      {projects ? <ProjectField projects={projects} value={picked} onValueChange={setPicked} /> : null}
      <Field label="Name" htmlFor="aud-name">
        <Input id="aud-name" name="name" required autoFocus placeholder="Beta testers" />
      </Field>
    </FormDialog>
  );
}

/** ⋯ menu for an audience (list rows and the detail page header). */
export function AudienceMenu({ slug, id, name, afterDelete }: { slug: string; id: string; name: string; afterDelete?: "list" }) {
  const to = useLink(slug);
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "rename" | "delete">(null);
  const close = (v: boolean) => !v && setDialog(null);
  return (
    <span className="relative z-10">
      <DropdownMenu>
        <MoreButton label={`Actions for ${name}`} className={afterDelete ? "size-8" : undefined} />
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil /> Rename…
          </DropdownMenuItem>
          <DropdownMenuItem tone="danger" onSelect={() => setDialog("delete")}>
            <Trash2 /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormDialog open={dialog === "rename"} onOpenChange={close} title="Rename audience" action={renameAudienceAction.bind(null, slug, id)} submitLabel="Save" size="sm">
        <Field label="Name" htmlFor={`ra-${id}`}>
          <Input id={`ra-${id}`} name="name" defaultValue={name} required autoFocus />
        </Field>
      </FormDialog>
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`Delete ${name}?`}
        body="Contacts are kept."
        confirmLabel="Delete audience"
        tone="danger"
        action={deleteAudienceAction.bind(null, slug, id)}
        onSuccess={() => afterDelete === "list" && router.push(to("audiences"))}
      />
    </span>
  );
}

"use client";

import { Plus } from "lucide-react";
import { addDomainAction, type DomainSetupView } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ProjectField, type PickerProject } from "@/components/project-field";
import { SetupResult } from "./setup-domain";

/** With `projects` (the "All projects" view, `slug` = ALL) the dialog asks which project gets the domain. */
export function AddDomainButton({ slug, projects }: { slug: string; projects?: PickerProject[] }) {
  return (
    <FormDialog
      trigger={
        <Button variant="primary">
          <Plus /> Add domain
        </Button>
      }
      title="Add domain"
      description="Adds the domain to the project and sets it up in Cloudflare Email Sending, with its DNS records. Its DNS must be on Cloudflare."
      action={addDomainAction.bind(null, slug)}
      submitLabel="Add domain"
      size="md"
      successView={(s) => <SetupResult view={s.data as DomainSetupView} />}
    >
      {projects ? <ProjectField projects={projects} /> : null}
      <Field label="Domain" htmlFor="new-domain">
        <Input id="new-domain" name="domain" required autoFocus placeholder="send.acme.com" className="font-mono" spellCheck={false} />
      </Field>
    </FormDialog>
  );
}

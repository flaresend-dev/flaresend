"use client";

import { useState } from "react";
import type { ProjectRecord } from "@flaresend/types";
import { updateDomainsAction } from "@/app/actions";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { projectOptions } from "@/components/project-field";

type SendingProject = Pick<ProjectRecord, "slug" | "name" | "disabledAt" | "defaultFrom" | "allowedSenders" | "allowedDomains">;

/**
 * The "Sending" card of Domains: the project default sender and allowed sender addresses. With more than one
 * project (the "All projects" view) it starts with a project picker.
 */
export function SendingCard({ projects }: { projects: SendingProject[] }) {
  const [slug, setSlug] = useState(projects.find((pr) => !pr.disabledAt)?.slug ?? projects[0]?.slug ?? "");
  const project = projects.find((pr) => pr.slug === slug);
  if (!project) return null;
  const many = projects.length > 1;

  return (
    <Card className="mt-10">
      <ActionForm
        key={project.slug}
        action={updateDomainsAction.bind(null, project.slug)}
        className="gap-0"
        statusClassName="mx-5 mb-4 w-auto"
        footer={
          <CardFooter>
            <SubmitButton>Save</SubmitButton>
          </CardFooter>
        }
      >
        <CardHeader
          actions={many ? <Select ariaLabel="Project" className="w-56" value={project.slug} onValueChange={setSlug} options={projectOptions(projects)} /> : undefined}
        >
          <CardTitle>Sending</CardTitle>
          <CardDescription>{many ? "Which addresses a project may send from." : "Which addresses this project may send from."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-x-8">
          <div className="md:pt-1.5">
            <p className="text-sm font-medium">Project default sender</p>
            <p className="text-xs text-foreground-muted">Used when a send has no from address. Set a sender for each domain from its menu above.</p>
          </div>
          <Field label={<span className="md:sr-only">Project default sender</span>} htmlFor="defaultFrom">
            <Input id="defaultFrom" name="defaultFrom" defaultValue={project.defaultFrom ?? ""} placeholder={`${project.name} <hello@${project.allowedDomains[0] ?? "example.com"}>`} />
          </Field>
          <div className="md:pt-1.5">
            <p className="text-sm font-medium">Allowed sender addresses</p>
            <p className="text-xs text-foreground-muted">Optional</p>
          </div>
          <Field
            label={<span className="md:sr-only">Allowed sender addresses</span>}
            htmlFor="allowedSenders"
            description="Comma separated. Leave empty to allow any address on a verified domain."
          >
            <Input id="allowedSenders" name="allowedSenders" defaultValue={(project.allowedSenders ?? []).join(", ")} placeholder={`hello@${project.allowedDomains[0] ?? "example.com"}`} className="font-mono" />
          </Field>
        </CardContent>
      </ActionForm>
    </Card>
  );
}

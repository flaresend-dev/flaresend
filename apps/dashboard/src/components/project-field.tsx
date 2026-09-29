"use client";

import { useRouter } from "next/navigation";
import type { ProjectRecord } from "@flaresend/types";
import { ALL, link, type ProjectSection } from "@/lib/nav";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

/** The fields of a project the "All projects" pickers need. Server pages pass ProjectRecords, which fit. */
export type PickerProject = Pick<ProjectRecord, "slug" | "name" | "disabledAt">;

export const projectOptions = (projects: PickerProject[]) =>
  projects.map((pr) => ({ value: pr.slug, label: pr.disabledAt ? `${pr.name} (paused)` : pr.name, description: pr.slug }));

/**
 * The "Project" field of a create dialog in the "All projects" view. It submits as `project`; the server action
 * reads it when the dialog is bound to ALL instead of a project (see `target()` in actions.ts).
 */
export function ProjectField({ projects, value, onValueChange }: {
  projects: PickerProject[];
  value?: string;
  onValueChange?: (slug: string) => void;
}) {
  return (
    <Field label="Project">
      <Select
        name="project"
        ariaLabel="Project"
        required
        options={projectOptions(projects)}
        {...(value !== undefined ? { value } : { defaultValue: projects.find((pr) => !pr.disabledAt)?.slug ?? projects[0]?.slug })}
        onValueChange={onValueChange}
      />
    </Field>
  );
}

/** Project switcher above a per-project page in the "All projects" view (Contacts, Settings). */
export function ProjectPickerBar({ projects, current, section }: { projects: PickerProject[]; current: string; section: ProjectSection }) {
  const router = useRouter();
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="text-sm text-foreground-muted">Project</span>
      <Select
        ariaLabel="Project"
        className="w-64"
        value={current}
        onValueChange={(slug) => slug !== current && router.push(link(ALL, slug, section))}
        options={projectOptions(projects)}
      />
    </div>
  );
}

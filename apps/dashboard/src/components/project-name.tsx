import type { ProjectRecord } from "@flaresend/types";
import { TD, TH } from "@/components/ui/table";

/** A project's name, marked when it is paused. For the Project column of "All projects" tables. */
export function ProjectName({ project }: { project: Pick<ProjectRecord, "name" | "disabledAt"> }) {
  return (
    <>
      {project.name}
      {project.disabledAt ? <span className="text-foreground-subtle"> (paused)</span> : null}
    </>
  );
}

/** Project column header; shown from `lg` up so phones keep the main columns. */
export function ProjectTH() {
  return <TH className="hidden w-[150px] lg:table-cell">Project</TH>;
}

export function ProjectTD({ project }: { project: Pick<ProjectRecord, "name" | "disabledAt"> }) {
  return (
    <TD className="hidden truncate text-foreground-muted lg:table-cell">
      <ProjectName project={project} />
    </TD>
  );
}

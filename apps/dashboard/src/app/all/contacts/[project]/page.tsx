import { ALL } from "@/lib/nav";
import { getProjectOr404, listProjects, type SearchParamsProp } from "@/lib/project";
import { ProjectPickerBar } from "@/components/project-field";
import ContactsPage from "../../../[slug]/contacts/page";

export { metadata } from "../../../[slug]/contacts/page";

export default async function AllContactsPage({ params, searchParams }: { params: Promise<{ project: string }> } & SearchParamsProp) {
  const { project } = await params;
  await getProjectOr404(project);
  const projects = await listProjects();
  return <ContactsPage params={Promise.resolve({ slug: project, view: ALL })} searchParams={searchParams} picker={projects.ok ? <ProjectPickerBar projects={projects.data} current={project} section="contacts" /> : null} />;
}

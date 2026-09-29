import { ALL } from "@/lib/nav";
import { getProjectOr404, listProjects } from "@/lib/project";
import { ProjectPickerBar } from "@/components/project-field";
import SettingsPage from "../../../[slug]/settings/page";

export { metadata } from "../../../[slug]/settings/page";

export default async function AllSettingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  await getProjectOr404(project);
  const projects = await listProjects();
  return <SettingsPage params={Promise.resolve({ slug: project, view: ALL })} picker={projects.ok ? <ProjectPickerBar projects={projects.data} current={project} section="settings" /> : null} />;
}

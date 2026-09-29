import { ALL } from "@/lib/nav";
import { getProjectOr404 } from "@/lib/project";
import NewTemplatePage from "../../../../[slug]/templates/new/page";

export { metadata } from "../../../../[slug]/templates/new/page";

export default async function AllNewTemplatePage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  await getProjectOr404(project);
  return <NewTemplatePage params={Promise.resolve({ slug: project, view: ALL })} />;
}

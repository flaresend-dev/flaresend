import { ALL } from "@/lib/nav";
import { getProjectOr404 } from "@/lib/project";
import TemplatePage from "../../../../[slug]/templates/[name]/page";

export { generateMetadata } from "../../../../[slug]/templates/[name]/page";

export default async function AllTemplatePage({ params }: { params: Promise<{ project: string; name: string }> }) {
  const { project, name } = await params;
  await getProjectOr404(project);
  return <TemplatePage params={Promise.resolve({ slug: project, name, view: ALL })} />;
}

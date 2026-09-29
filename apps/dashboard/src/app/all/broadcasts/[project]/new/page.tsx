import { ALL } from "@/lib/nav";
import { getProjectOr404 } from "@/lib/project";
import NewBroadcastPage from "../../../../[slug]/broadcasts/new/page";

export { metadata } from "../../../../[slug]/broadcasts/new/page";

export default async function AllNewBroadcastPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  await getProjectOr404(project);
  return <NewBroadcastPage params={Promise.resolve({ slug: project, view: ALL })} />;
}

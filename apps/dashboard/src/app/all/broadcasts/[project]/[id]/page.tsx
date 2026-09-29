import { ALL } from "@/lib/nav";
import { getProjectOr404 } from "@/lib/project";
import BroadcastPage from "../../../../[slug]/broadcasts/[id]/page";

export { metadata } from "../../../../[slug]/broadcasts/[id]/page";

export default async function AllBroadcastPage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id } = await params;
  await getProjectOr404(project);
  return <BroadcastPage params={Promise.resolve({ slug: project, id, view: ALL })} />;
}

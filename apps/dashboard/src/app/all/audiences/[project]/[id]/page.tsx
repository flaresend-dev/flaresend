import { ALL } from "@/lib/nav";
import { getProjectOr404, type SearchParamsProp } from "@/lib/project";
import AudiencePage from "../../../../[slug]/audiences/[id]/page";

export { metadata } from "../../../../[slug]/audiences/[id]/page";

export default async function AllAudiencePage({ params, searchParams }: { params: Promise<{ project: string; id: string }> } & SearchParamsProp) {
  const { project, id } = await params;
  await getProjectOr404(project);
  return <AudiencePage params={Promise.resolve({ slug: project, id, view: ALL })} searchParams={searchParams} />;
}

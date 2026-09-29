import { ALL } from "@/lib/nav";
import { getProjectOr404, type SearchParamsProp } from "@/lib/project";
import WebhookPage from "../../../../[slug]/webhooks/[id]/page";

export { metadata } from "../../../../[slug]/webhooks/[id]/page";

export default async function AllWebhookPage({ params, searchParams }: { params: Promise<{ project: string; id: string }> } & SearchParamsProp) {
  const { project, id } = await params;
  await getProjectOr404(project);
  return <WebhookPage params={Promise.resolve({ slug: project, id, view: ALL })} searchParams={searchParams} />;
}

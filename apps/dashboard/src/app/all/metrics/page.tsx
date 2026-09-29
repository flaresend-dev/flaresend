import type { SearchParamsProp } from "@/lib/project";
import { ALL } from "@/lib/nav";
import MetricsPage from "../../[slug]/metrics/page";

export { metadata } from "../../[slug]/metrics/page";

export default function AllMetricsPage({ searchParams }: SearchParamsProp) {
  return <MetricsPage params={Promise.resolve({ slug: ALL })} searchParams={searchParams} />;
}

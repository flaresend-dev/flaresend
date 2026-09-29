import type { SearchParamsProp } from "@/lib/project";
import { ALL } from "@/lib/nav";
import LogsPage from "../../[slug]/logs/page";

export { metadata } from "../../[slug]/logs/page";

export default function AllLogsPage({ searchParams }: SearchParamsProp) {
  return <LogsPage params={Promise.resolve({ slug: ALL })} searchParams={searchParams} />;
}

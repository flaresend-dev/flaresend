import type { SearchParamsProp } from "@/lib/project";
import { ALL } from "@/lib/nav";
import SuppressionsPage from "../../[slug]/suppressions/page";

export { metadata } from "../../[slug]/suppressions/page";

export default function AllSuppressionsPage({ searchParams }: SearchParamsProp) {
  return <SuppressionsPage params={Promise.resolve({ slug: ALL })} searchParams={searchParams} />;
}

import { ALL } from "@/lib/nav";
import TemplatesPage from "../../[slug]/templates/page";

export { metadata } from "../../[slug]/templates/page";

export default function AllTemplatesPage() {
  return <TemplatesPage params={Promise.resolve({ slug: ALL, view: ALL })} />;
}

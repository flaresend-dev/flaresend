import { ALL } from "@/lib/nav";
import AudiencesPage from "../../[slug]/audiences/page";

export { metadata } from "../../[slug]/audiences/page";

export default function AllAudiencesPage() {
  return <AudiencesPage params={Promise.resolve({ slug: ALL, view: ALL })} />;
}

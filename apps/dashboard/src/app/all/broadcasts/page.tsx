import { ALL } from "@/lib/nav";
import BroadcastsPage from "../../[slug]/broadcasts/page";

export { metadata } from "../../[slug]/broadcasts/page";

export default function AllBroadcastsPage() {
  return <BroadcastsPage params={Promise.resolve({ slug: ALL, view: ALL })} />;
}

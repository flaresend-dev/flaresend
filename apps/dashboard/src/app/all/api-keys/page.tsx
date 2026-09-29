import { ALL } from "@/lib/nav";
import ApiKeysPage from "../../[slug]/api-keys/page";

export { metadata } from "../../[slug]/api-keys/page";

export default function AllApiKeysPage() {
  return <ApiKeysPage params={Promise.resolve({ slug: ALL, view: ALL })} />;
}

import { ALL } from "@/lib/nav";
import WebhooksPage from "../../[slug]/webhooks/page";

export { metadata } from "../../[slug]/webhooks/page";

export default function AllWebhooksPage() {
  return <WebhooksPage params={Promise.resolve({ slug: ALL, view: ALL })} />;
}

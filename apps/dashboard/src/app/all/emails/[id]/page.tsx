import { ALL } from "@/lib/nav";
import EmailPage from "../../../[slug]/emails/[id]/page";

export { metadata } from "../../../[slug]/emails/[id]/page";

export default async function AllEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmailPage params={Promise.resolve({ slug: ALL, id })} />;
}

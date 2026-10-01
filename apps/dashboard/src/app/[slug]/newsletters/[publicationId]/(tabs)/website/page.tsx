import { mailerCall } from "@/lib/mailer";
import { PageError } from "@/components/page-error";
import { WebsiteSettings } from "@/components/newsletters/settings";

export const metadata = { title: "Newsletter website" };

export default async function Page({ params }: { params: Promise<{ slug: string; publicationId: string }> }) {
  const { slug, publicationId } = await params;
  const r = await mailerCall(async (m) => {
    const [publication, capabilities] = await Promise.all([
      m.getPublication(slug, publicationId),
      m.newsletterCapabilities(slug, publicationId),
    ]);
    return { publication, capabilities };
  });
  if (!r.ok) return <PageError error={r.error} />;
  return <WebsiteSettings key={r.data.publication.revision} slug={slug} initial={r.data.publication} capabilities={r.data.capabilities} />;
}

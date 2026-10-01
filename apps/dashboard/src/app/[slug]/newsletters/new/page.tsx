import { NewsletterSetup } from "@/components/newsletters/setup";
import { PageHeader } from "@/components/ui/page-header";
import { mailerCall } from "@/lib/mailer";
import { getProjectOr404, type SlugParams } from "@/lib/project";

export const metadata = { title: "New newsletter" };

export default async function Page({ params }: SlugParams) {
  const { slug } = await params;
  await getProjectOr404(slug);
  const list = await mailerCall((m) => m.listPublications(slug, { limit: 100 }));
  const publications = list.ok ? list.data.data : [];
  // The public address prefix, taken from an existing newsletter when there is one.
  const sample = publications[0]?.publicUrl;
  const base = sample
    ? sample.replace(/^https?:\/\//, "").replace(/[^/]+$/, "")
    : `…/n/${slug}/`;
  return (
    <>
      <PageHeader
        title="New newsletter"
        description="One page. You can change all of it later."
        back={{ href: `/${slug}/newsletters`, label: "Newsletters" }}
      />
      <NewsletterSetup slug={slug} taken={publications.map((p) => p.slug)} addressBase={base} />
    </>
  );
}

import { redirect } from "next/navigation";

/** The Reports tab is now Analytics. */
export default async function Page({ params }: { params: Promise<{ slug: string; publicationId: string }> }) {
  const { slug, publicationId } = await params;
  redirect(`/${slug}/newsletters/${publicationId}/analytics`);
}

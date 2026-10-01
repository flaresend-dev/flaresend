import { mailerCall } from "@/lib/mailer";
import { PageHeader } from "@/components/ui/page-header";
import { PageError } from "@/components/page-error";
import { PostReview } from "@/components/newsletters/review";

export const metadata = { title: "Review and send" };

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; publicationId: string; postId: string }>;
}) {
  const { slug, publicationId, postId } = await params;
  const r = await mailerCall(async (m) => {
    const [review, publication, tags, subscribers] = await Promise.all([
      m.reviewNewsletterPost(slug, publicationId, postId),
      m.getPublication(slug, publicationId),
      m.listNewsletterTags(slug, publicationId),
      m.listNewsletterSubscribers(slug, publicationId, { limit: 100, filter: { status: "subscribed" } }),
    ]);
    return { review, publication, tags, subscribers: subscribers.data };
  });
  const back = { href: `/${slug}/newsletters/${publicationId}/posts/${postId}`, label: "Back to editing" };
  if (!r.ok)
    return (
      <>
        <PageHeader title="Review and send" back={back} />
        <PageError error={r.error} title="Could not load this post" />
      </>
    );
  return (
    <>
      <PageHeader title="Review and send" description={r.data.review.post.title || "Untitled post"} back={back} />
      <PostReview
        slug={slug}
        initial={r.data.review}
        publication={r.data.publication}
        tags={r.data.tags}
        subscribers={r.data.subscribers}
      />
    </>
  );
}

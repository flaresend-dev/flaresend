import { mailerCall } from "@/lib/mailer";
import { PageError } from "@/components/page-error";
import { PostEditor } from "@/components/newsletters/editor/post-editor";

export const metadata = { title: "Edit post" };

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; publicationId: string; postId: string }>;
}) {
  const { slug, publicationId, postId } = await params;
  const r = await mailerCall(async (m) => {
    const [post, publication, capabilities, subscribers] = await Promise.all([
      m.getNewsletterPost(slug, publicationId, postId),
      m.getPublication(slug, publicationId),
      m.newsletterCapabilities(slug, publicationId),
      m.listNewsletterSubscribers(slug, publicationId, { limit: 100, filter: { status: "subscribed" } }),
    ]);
    return { post, publication, capabilities, subscribers: subscribers.data };
  });
  if (!r.ok) return <PageError error={r.error} title="Could not open this post" />;
  return (
    <PostEditor
      key={r.data.post.id}
      slug={slug}
      publication={r.data.publication}
      initial={r.data.post}
      capabilities={r.data.capabilities}
      subscribers={r.data.subscribers}
    />
  );
}

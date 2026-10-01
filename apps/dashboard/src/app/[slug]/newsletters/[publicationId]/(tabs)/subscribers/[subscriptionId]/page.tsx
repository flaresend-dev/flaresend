import { mailerCall } from "@/lib/mailer";
import { PageError } from "@/components/page-error";
import { SubscriberDetail } from "@/components/newsletters/subscribers";

export const metadata = { title: "Subscriber" };

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; publicationId: string; subscriptionId: string }>;
}) {
  const { slug, publicationId, subscriptionId } = await params;
  const r = await mailerCall(async (m) => {
    const [subscriber, tags] = await Promise.all([
      m.getNewsletterSubscriber(slug, publicationId, subscriptionId),
      m.listNewsletterTags(slug, publicationId),
    ]);
    return { subscriber, tags };
  });
  if (!r.ok) return <PageError error={r.error} title="Could not load this subscriber" />;
  return <SubscriberDetail key={r.data.subscriber.revision} slug={slug} initial={r.data.subscriber} tags={r.data.tags} />;
}

import { PenLine } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { SegmentedLinks } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { PageError } from "@/components/page-error";
import { PostTable } from "@/components/newsletters/post-table";
import { PostCreate } from "@/components/newsletters/post-create";

export const metadata = { title: "Posts" };

const STATES = [
  ["", "All"],
  ["draft", "Drafts"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
  ["archived", "Archived"],
] as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; publicationId: string }>;
  searchParams: Promise<{ cursor?: string; state?: string }>;
}) {
  const { slug, publicationId: id } = await params;
  const q = await searchParams;
  const state = STATES.some(([s]) => s === q.state) ? (q.state ?? "") : "";
  const r = await mailerCall((m) => m.listNewsletterPosts(slug, id, { cursor: q.cursor, state: state || undefined }));
  const base = `/${slug}/newsletters/${id}`;
  const href = (s: string) => `${base}/posts${s ? `?state=${s}` : ""}`;
  return (
    <div className="flex flex-col gap-4">
      <SegmentedLinks
        ariaLabel="Filter posts"
        value={state}
        options={STATES.map(([s, label]) => ({ value: s, label, href: href(s) }))}
        className="w-fit max-w-full overflow-x-auto"
      />
      {!r.ok ? (
        <PageError error={r.error} title="Could not load posts" />
      ) : r.data.data.length ? (
        <>
          <PostTable slug={slug} base={base} posts={r.data.data} />
          {r.data.nextCursor ? (
            <LinkButton
              href={`${base}/posts?${new URLSearchParams({ cursor: r.data.nextCursor, ...(state ? { state } : {}) })}`}
              className="w-fit"
            >
              Next page
            </LinkButton>
          ) : null}
        </>
      ) : state ? (
        <EmptyState icon={<PenLine />} title={`No ${STATES.find(([s]) => s === state)![1].toLowerCase()} posts`} action={<LinkButton href={href("")}>Show all posts</LinkButton>} />
      ) : (
        <EmptyState icon={<PenLine />} title="Write your first post" action={<PostCreate slug={slug} id={id} label="Write a post" />}>
          Draft it yourself or let AI write a first version.
        </EmptyState>
      )}
    </div>
  );
}

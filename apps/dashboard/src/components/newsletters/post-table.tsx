import type { NewsletterPostRecord } from "@flaresend/types";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { num, pct, ratio } from "@/lib/format";
import { PostRowMenu } from "./post-row-menu";

/** Where a row goes: the report once something went out, else the editor. */
export function postHref(base: string, p: NewsletterPostRecord) {
  return p.email || p.publicRevisionId ? `${base}/posts/${p.id}/report` : `${base}/posts/${p.id}`;
}

export function EmailCell({ post }: { post: NewsletterPostRecord }) {
  const e = post.email;
  if (!e) return <span className="text-foreground-muted">{post.publicRevisionId ? "Website only" : "Not sent"}</span>;
  if (e.status === "scheduled" || e.status === "sending")
    return (
      <span className="flex flex-col items-start gap-0.5">
        <StatusBadge status={e.status} label={`${e.status === "scheduled" ? "Scheduled" : "Sending"} · ${num(e.total)}`} />
        {e.scheduledAt ? <span className="text-xs text-foreground-muted"><Time iso={e.scheduledAt} format="absolute" /></span> : null}
      </span>
    );
  if (e.status === "canceled") return <StatusBadge status="canceled" />;
  const open = ratio(e.opened, e.delivered);
  const click = ratio(e.clicked, e.delivered);
  return (
    <span className="tabular-nums">
      {num(e.delivered)} delivered
      {e.delivered ? <span className="text-foreground-muted"> · {pct(open, 0)} opened · {pct(click, 0)} clicked</span> : null}
    </span>
  );
}

function webStatus(p: NewsletterPostRecord) {
  if (p.archivedAt) return "archived";
  if (p.webStatus === "draft" && p.email) return "unpublished";
  return p.webStatus;
}

export function PostTable({ slug, base, posts, menu = true }: { slug: string; base: string; posts: NewsletterPostRecord[]; menu?: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Post</TH>
          <TH className="w-36">Website</TH>
          <TH className="w-64">Email</TH>
          <TH className="w-28">Updated</TH>
          {menu ? <TH className="w-12"><span className="sr-only">Actions</span></TH> : null}
        </tr>
      </THead>
      <TBody>
        {posts.map((p) => (
          <TR key={p.id} href={postHref(base, p)} label={`Open ${p.title || "Untitled post"}`}>
            <TD>
              <span className="block truncate font-medium">{p.title || <span className="text-foreground-muted">Untitled post</span>}</span>
              {p.subtitle ? <span className="block truncate text-xs text-foreground-muted">{p.subtitle}</span> : null}
            </TD>
            <TD>
              <span className="flex flex-col items-start gap-0.5">
                <StatusBadge status={webStatus(p)} label={webStatus(p) === "unpublished" ? "Not on website" : undefined} />
                {p.webStatus === "scheduled" && p.webScheduledAt ? (
                  <span className="text-xs text-foreground-muted"><Time iso={p.webScheduledAt} format="absolute" /></span>
                ) : null}
              </span>
            </TD>
            <TD className="text-sm">
              <EmailCell post={p} />
            </TD>
            <TD className="text-foreground-muted">
              <Time iso={p.updatedAt} />
            </TD>
            {menu ? (
              <TD className="text-right">
                <PostRowMenu slug={slug} base={base} post={p} />
              </TD>
            ) : null}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

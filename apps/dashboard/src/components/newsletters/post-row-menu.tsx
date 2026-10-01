"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NewsletterPostRecord } from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { CellAction } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, MoreButton } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/components/ui/toast";

export function PostRowMenu({ slug, base, post }: { slug: string; base: string; post: NewsletterPostRecord }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const run = async (c: "duplicate" | "archive" | "delete") => {
    const r = await newsletterAction(slug, "newsletterPostCommand", post.publicationId, post.id, c, post.revision);
    if (!r.ok) {
      toastError(r.error.message);
      return { error: r.error.message };
    }
    if (c === "duplicate" && !("deleted" in r.data)) {
      router.push(`${base}/posts/${r.data.id}`);
      return { ok: true };
    }
    toastSuccess(c === "archive" ? "Post archived." : "Draft deleted.");
    router.refresh();
    return { ok: true };
  };
  const deletable = !post.publishedAt && !post.publicRevisionId && post.webStatus !== "scheduled" && !post.email;
  return (
    <CellAction>
      <DropdownMenu>
        <MoreButton label={`Actions for ${post.title || "this post"}`} />
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => router.push(`${base}/posts/${post.id}`)}>Open in editor</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run("duplicate")}>Duplicate</DropdownMenuItem>
          {!post.archivedAt ? <DropdownMenuItem onSelect={() => void run("archive")}>Archive</DropdownMenuItem> : null}
          {deletable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" onSelect={() => setConfirm(true)}>Delete draft</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this draft?"
        body="This cannot be undone."
        confirmLabel="Delete draft"
        tone="danger"
        successMessage=""
        onConfirm={async () => (await run("delete")) as never}
      />
    </CellAction>
  );
}

"use client";
import type { NewsletterPostRecord, NewsletterSubscriptionRecord } from "@flaresend/types";
import { Sheet } from "@/components/ui/sheet";
import { PreviewFrame, SendTestButton } from "../preview";

export function PreviewSheet({
  open, onOpenChange, slug, post, subscribers, canSendTest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  post: NewsletterPostRecord;
  subscribers: NewsletterSubscriptionRecord[];
  canSendTest: boolean;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Preview"
      description="The saved draft, as readers will see it."
      className="max-w-[min(960px,100vw)]"
      footer={
        <>
          <span className="text-xs text-foreground-muted">
            {canSendTest ? "Links in the preview are not tracked." : "Verify a sender in Settings to send a test."}
          </span>
          <SendTestButton slug={slug} post={post} disabledReason={canSendTest ? null : "Verify a sender in Settings first."} />
        </>
      }
    >
      {open ? <PreviewFrame slug={slug} post={post} subscribers={subscribers} refreshKey={post.draftRevisionId} height="calc(100dvh - 260px)" /> : null}
    </Sheet>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Trash2, XCircle } from "lucide-react";
import { cancelBroadcastAction, deleteBroadcastAction } from "@/app/actions";
import { p } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, MoreButton } from "@/components/ui/dropdown-menu";

export function BroadcastActions({ slug, id, cancelable, deletable }: { slug: string; id: string; cancelable: boolean; deletable: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "cancel" | "delete">(null);
  const close = (v: boolean) => !v && setDialog(null);
  return (
    <>
      {cancelable ? (
        <Button variant="secondary" onClick={() => setDialog("cancel")}>
          <XCircle /> Cancel
        </Button>
      ) : null}
      <DropdownMenu>
        <MoreButton className="size-8" />
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => router.push(`${p(slug, "emails")}?tag=${encodeURIComponent(`broadcast_id:${id}`)}`)}>
            <Mail /> View emails
          </DropdownMenuItem>
          {deletable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" onSelect={() => setDialog("delete")}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={close}
        title="Cancel this broadcast?"
        body="Sending stops at the next batch. Emails already sent are not recalled."
        confirmLabel="Cancel broadcast"
        tone="danger"
        action={cancelBroadcastAction.bind(null, slug, id)}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title="Delete this broadcast?"
        body="Emails that were already sent are kept on the Emails page."
        confirmLabel="Delete broadcast"
        tone="danger"
        action={deleteBroadcastAction.bind(null, slug, id)}
        onSuccess={() => router.push(p(slug, "broadcasts"))}
      />
    </>
  );
}

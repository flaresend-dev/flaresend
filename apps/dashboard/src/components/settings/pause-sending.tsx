"use client";

import { Pause, Play } from "lucide-react";
import { setProjectDisabledAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function PauseSendingButton({ slug, paused }: { slug: string; paused: boolean }) {
  if (paused) {
    return (
      <ConfirmDialog
        trigger={
          <Button variant="primary">
            <Play /> Resume sending
          </Button>
        }
        title="Resume sending?"
        body="Sends for this project are accepted again right away."
        confirmLabel="Resume sending"
        action={setProjectDisabledAction.bind(null, slug, false)}
      />
    );
  }
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger">
          <Pause /> Pause sending
        </Button>
      }
      title="Pause sending?"
      body="Every send for this project, over HTTP and RPC, is rejected until you resume. Nothing is deleted."
      confirmLabel="Pause sending"
      tone="danger"
      typeToConfirm={slug}
      action={setProjectDisabledAction.bind(null, slug, true)}
    />
  );
}

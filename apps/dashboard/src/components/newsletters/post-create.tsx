"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { newsletterAction } from "@/app/newsletter-actions";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toast";

/** Creates an empty draft and opens it in the editor. */
export function PostCreate({
  slug, id, disabled = false, label = "New post", variant = "primary",
}: {
  slug: string;
  id: string;
  disabled?: boolean;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={disabled}
      loading={busy}
      onClick={() =>
        start(async () => {
          const r = await newsletterAction(slug, "createNewsletterPost", id, {});
          if (r.ok) router.push(`/${slug}/newsletters/${id}/posts/${r.data.id}`);
          else toastError(r.error.message);
        })
      }
    >
      {busy ? null : <Plus />} {label}
    </Button>
  );
}

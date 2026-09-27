import { CircleAlert } from "lucide-react";
import { formatUiError, type UiError } from "@/lib/errors";
import { Notice } from "@/components/ui/badge";

/** A failed mailer call, shown in place of the content that could not load. */
export function PageError({ error, title = "Could not load this page" }: { error: UiError; title?: string }) {
  return (
    <Notice tone="danger" icon={<CircleAlert />} title={title}>
      <code className="break-all">{formatUiError(error)}</code>
    </Notice>
  );
}

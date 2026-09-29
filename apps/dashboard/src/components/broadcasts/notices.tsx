import { CircleAlert, TriangleAlert } from "lucide-react";
import { link } from "@/lib/nav";
import { Notice } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";

/** The transactional-only warning, and the "broadcasts are off" notice when they are. `view`: see SlugParams. */
export function BroadcastNotices({ slug, view, enabled }: { slug: string; view?: string; enabled: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      {!enabled ? (
        <Notice
          tone="danger"
          icon={<CircleAlert />}
          title="Broadcasts are turned off for this project"
          actions={
            <LinkButton href={link(view ?? slug, slug, "settings")} size="sm" variant="secondary">
              Enable in Settings
            </LinkButton>
          }
        >
          Sending a broadcast returns <code>broadcasts_disabled</code> until you turn them on.
        </Notice>
      ) : null}
      <Notice tone="warning" icon={<TriangleAlert />}>
        <span className="text-foreground">
          Cloudflare Email Service is for transactional email. Broadcasts are for small opted-in lists (max 500 recipients).
        </span>{" "}
        <details className="group inline">
          <summary className="inline cursor-pointer list-none font-medium text-warning-fg underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Learn more</span>
          </summary>
          <span className="mt-1 block">
            Cloudflare&apos;s docs say marketing and bulk campaigns are not permitted. The mailer caps each broadcast at{" "}
            <code>BROADCAST_MAX_RECIPIENTS</code> (500 by default), skips unsubscribed and suppressed contacts, and adds a one-click
            unsubscribe link to every email.
          </span>
        </details>
      </Notice>
    </div>
  );
}

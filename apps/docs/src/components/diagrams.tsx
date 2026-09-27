import { ArrowDown, ArrowRight, Boxes, Cloud, Code2, Inbox, ListOrdered, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusBadge } from './status-badge';

function Node({ icon, title, children, accent }: { icon: ReactNode; title: string; children: ReactNode; accent?: boolean }) {
  return (
    <div
      className={
        'flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl border bg-fd-background p-3.5 ' +
        (accent ? 'border-brand/50 shadow-[0_0_0_3px_var(--color-brand-soft)]' : 'border-fd-border')
      }
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold text-fd-foreground">
        <span className={accent ? 'text-brand' : 'text-fd-muted-foreground'}>{icon}</span>
        {title}
      </div>
      <div className="text-[12.5px] leading-snug text-fd-muted-foreground">{children}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex shrink-0 items-center justify-center text-fd-muted-foreground" aria-hidden>
      <ArrowRight className="hidden size-4 md:block" />
      <ArrowDown className="size-4 md:hidden" />
    </div>
  );
}

/** How one send moves through Flaresend. Mirrors "How a send works" in the repo README. */
export function ArchitectureDiagram() {
  return (
    <figure className="not-prose my-6 rounded-2xl border border-fd-border bg-fd-card p-4 md:p-5">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fd-muted-foreground">Sending</div>
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        <Node icon={<Code2 className="size-4" />} title="Your app">
          HTTP with an API key, or RPC from a Worker in the same account
        </Node>
        <Arrow />
        <Node icon={<Boxes className="size-4" />} title="Flaresend Worker" accent>
          Validates, logs to D1, stores the body in R2, answers <code className="font-mono">202 queued</code>
        </Node>
        <Arrow />
        <Node icon={<ListOrdered className="size-4" />} title="Send queue">
          Retries with backoff, up to 8 times
        </Node>
        <Arrow />
        <Node icon={<Cloud className="size-4" />} title="Email Service">
          Cloudflare delivers the message
        </Node>
      </div>
      <div className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-fd-muted-foreground">After sending</div>
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        <Node icon={<Inbox className="size-4" />} title="Delivery events">
          One event per recipient: delivered, bounced, complained…
        </Node>
        <Arrow />
        <Node icon={<ListOrdered className="size-4" />} title="Events queue">
          Deduped, never downgrades a final status
        </Node>
        <Arrow />
        <Node icon={<Boxes className="size-4" />} title="Status + suppressions" accent>
          Email status updated, hard bounces and complaints suppressed
        </Node>
        <Arrow />
        <Node icon={<Webhook className="size-4" />} title="Your webhooks">
          Signed POST for every event you subscribe to
        </Node>
      </div>
    </figure>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-fd-border bg-fd-background p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-fd-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Row({ status, children }: { status: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <StatusBadge status={status} className="mt-px" />
      <span className="text-[12.5px] leading-snug text-fd-muted-foreground">{children}</span>
    </div>
  );
}

/** The email statuses, grouped by stage. */
export function LifecycleDiagram() {
  return (
    <figure className="not-prose my-6 flex flex-col gap-2 rounded-2xl border border-fd-border bg-fd-card p-4 md:flex-row md:p-5">
      <Column title="Accepted">
        <Row status="queued">On the send queue</Row>
        <Row status="scheduled">Waiting for scheduledAt</Row>
        <Row status="test">Sent with a test key. Never delivered</Row>
      </Column>
      <Arrow />
      <Column title="In flight">
        <Row status="sending">Picked up by the queue</Row>
        <Row status="sent">Handed to Cloudflare</Row>
        <Row status="deferred">Receiving server asked to retry later</Row>
      </Column>
      <Arrow />
      <Column title="Final">
        <Row status="delivered">Every recipient accepted it</Row>
        <Row status="bounced">A recipient bounced</Row>
        <Row status="complained">A recipient marked it as spam</Row>
        <Row status="rejected">Refused before delivery</Row>
        <Row status="failed">Could not be sent</Row>
        <Row status="canceled">Scheduled email canceled</Row>
      </Column>
    </figure>
  );
}

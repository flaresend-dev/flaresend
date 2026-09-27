import { cn } from '@/lib/cn';

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'muted' | 'violet';

/** Same grouping the dashboard uses for email statuses. */
const TONE: Record<string, Tone> = {
  delivered: 'success',
  sent: 'info',
  sending: 'info',
  queued: 'muted',
  scheduled: 'violet',
  deferred: 'warning',
  bounced: 'danger',
  complained: 'danger',
  rejected: 'danger',
  failed: 'danger',
  canceled: 'muted',
  test: 'violet',
  opened: 'success',
  clicked: 'success',
};

const CLASSES: Record<Tone, string> = {
  success: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-400',
  danger: 'bg-red-500/10 text-red-700 border-red-500/25 dark:text-red-400',
  warning: 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400',
  info: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-400',
  violet: 'bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-400',
  muted: 'bg-fd-muted text-fd-muted-foreground border-fd-border',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONE[status.replace(/^email\./, '')] ?? 'muted';
  return (
    <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[12px] leading-none', CLASSES[tone], className)}>
      {status}
    </span>
  );
}

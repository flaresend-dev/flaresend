import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Progress({ sent, total, className }: { sent: number; total: number; className?: string }) {
  const done = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  return (
    <div className={cn("flex max-w-56 items-center gap-2.5", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-background-hover"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${sent} of ${total} sent`}
      >
        <div className="h-full rounded-full bg-success-fg transition-[width] duration-500" style={{ width: `${done}%` }} />
      </div>
      <span className="shrink-0 text-xs text-foreground-muted tabular-nums">
        {num(sent)}/{num(total)}
      </span>
    </div>
  );
}

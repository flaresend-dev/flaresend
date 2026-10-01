"use client";
// A searchable list of IANA timezones with their current UTC offset.
import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, Globe } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function utcOffset(zone: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return part === "GMT" ? "UTC" : (part ?? "").replace("GMT", "UTC");
  } catch {
    return "";
  }
}

function zones(): string[] {
  try {
    const list = Intl.supportedValuesOf("timeZone");
    return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {
    return ["UTC"];
  }
}

export function TimezoneSelect({
  value, onChange, id, className, trigger,
}: {
  value: string;
  onChange: (zone: string) => void;
  id?: string;
  className?: string;
  /** Use a custom trigger (a link-style button) instead of the field. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const all = useMemo(() => zones().map((z) => ({ zone: z, offset: utcOffset(z) })), []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "inline-flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-background-elevated px-2.5 text-sm text-foreground shadow-card",
              "transition-colors hover:bg-background-hover focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Globe className="size-4 shrink-0 text-foreground-subtle" aria-hidden />
              <span className="truncate">{value}</span>
              <span className="shrink-0 text-foreground-muted">{utcOffset(value)}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-foreground-subtle" aria-hidden />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[min(360px,90vw)] p-0">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().replace(/_/g, " ").includes(search.toLowerCase().replace(/_/g, " ")) ? 1 : 0)}
        >
          <Command.Input
            autoFocus
            placeholder="Search a city or region"
            className="h-10 w-full border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-foreground-subtle"
          />
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-foreground-muted">No timezone found.</Command.Empty>
            {all.map(({ zone, offset }) => (
              <Command.Item
                key={zone}
                value={`${zone} ${offset}`}
                onSelect={() => {
                  onChange(zone);
                  setOpen(false);
                }}
                className="flex h-8 cursor-default items-center gap-2 rounded-md px-2.5 text-sm outline-none data-[selected=true]:bg-background-hover"
              >
                <Check className={cn("size-3.5 shrink-0", zone === value ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="flex-1 truncate">{zone.replace(/_/g, " ")}</span>
                <span className="shrink-0 text-xs text-foreground-muted tabular-nums">{offset}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useState } from "react";
import { WEBHOOK_EVENT_TYPES } from "@flaresend/types";
import { statusLabel } from "@/lib/labels";
import { Checkbox } from "@/components/ui/checkbox";
import { SwitchField } from "@/components/ui/switch";

/**
 * "All events" switch; when off, a checkbox grid of the event types. Submits `events` (one value per ticked type,
 * or `*` for all events, including types added later).
 */
export function EventsPicker({ selected }: { selected: string[] }) {
  const [all, setAll] = useState(selected.includes("*"));
  const [picked, setPicked] = useState<Set<string>>(new Set(selected.filter((s) => s !== "*")));
  return (
    <div className="flex flex-col gap-3">
      <SwitchField checked={all} onCheckedChange={setAll} label="All events" description="Includes event types added in the future." />
      {all ? (
        <input type="hidden" name="events" value="*" />
      ) : (
        <fieldset className="grid grid-cols-1 gap-1 rounded-md border border-border p-2 sm:grid-cols-2">
          <legend className="sr-only">Events</legend>
          {WEBHOOK_EVENT_TYPES.map((t) => (
            <label key={t} className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 transition-colors hover:bg-background-hover">
              <Checkbox
                name="events"
                value={t}
                className="mt-0.5"
                checked={picked.has(t)}
                onCheckedChange={(v) =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (v === true) n.add(t);
                    else n.delete(t);
                    return n;
                  })
                }
              />
              <span className="flex flex-col leading-tight">
                <span className="text-sm">{statusLabel(t)}</span>
                <span className="font-mono text-2xs text-foreground-subtle">{t}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

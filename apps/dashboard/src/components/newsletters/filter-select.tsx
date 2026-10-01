"use client";
import { useRef } from "react";
import { Select, type SelectOption } from "@/components/ui/select";

/** A Select inside a GET filter form that submits the form as soon as the value changes. */
export function FilterSelect(props: { name: string; defaultValue: string; options: SelectOption[]; ariaLabel: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span ref={ref} className="contents">
      <Select
        {...props}
        onValueChange={() => requestAnimationFrame(() => ref.current?.closest("form")?.requestSubmit())}
      />
    </span>
  );
}

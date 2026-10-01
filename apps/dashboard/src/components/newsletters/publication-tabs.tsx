"use client";
import { usePathname } from "next/navigation";
import { LinkTabs } from "@/components/ui/tabs";

const TABS = [
  ["", "Overview"],
  ["posts", "Posts"],
  ["subscribers", "Subscribers"],
  ["analytics", "Analytics"],
  ["website", "Website"],
  ["settings", "Settings"],
] as const;

export function PublicationTabs({ base }: { base: string }) {
  const path = usePathname() ?? "";
  const active = TABS.find(([part]) => part && path.startsWith(`${base}/${part}`))?.[0] ?? "";
  return (
    <LinkTabs
      active={active}
      tabs={TABS.map(([part, label]) => ({ id: part, label, href: part ? `${base}/${part}` : base }))}
    />
  );
}

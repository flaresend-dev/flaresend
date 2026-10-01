import {
  Ban, ChartLine, Contact, Globe, KeyRound, LayoutTemplate, Mail, Radio, Newspaper, ScrollText, Settings, Users, Webhook, type LucideIcon,
} from "lucide-react";
import type { ProjectSection } from "@/lib/nav";
import { cn } from "@/lib/utils";
import logo from "./logo.png";

/** Sidebar icons (section 2.2). */
export const NAV_ICONS: Record<ProjectSection, LucideIcon> = {
  emails: Mail,
  broadcasts: Radio,
  newsletters: Newspaper,
  audiences: Users,
  contacts: Contact,
  templates: LayoutTemplate,
  metrics: ChartLine,
  logs: ScrollText,
  domains: Globe,
  "api-keys": KeyRound,
  webhooks: Webhook,
  suppressions: Ban,
  settings: Settings,
};

/** The Flaresend logo: an orange envelope in front of a cloud. Master copy: assets/logo.png at the repo root. */
export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 192px static file; next/image adds nothing here
    <img src={logo.src} alt="" aria-hidden width={192} height={192} className={cn("object-contain", className)} />
  );
}

import { AppShell } from "@/components/shell/app-shell";

/** Minimal shell: the sidebar shows only the logo and "Projects". */
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell projects={[]}>{children}</AppShell>;
}

import { mailerCall } from "@/lib/mailer";
import { AppShell } from "@/components/shell/app-shell";
import { PageError } from "@/components/page-error";

/** The "All projects" view: the same shell as a project, with only the sections that work across projects. */
export default async function AllProjectsLayout({ children }: { children: React.ReactNode }) {
  const projects = await mailerCall((m) => m.listProjects());
  if (!projects.ok) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <PageError title="Could not reach the mailer" error={projects.error} />
      </div>
    );
  }
  return (
    <AppShell all projects={projects.data}>
      {children}
    </AppShell>
  );
}

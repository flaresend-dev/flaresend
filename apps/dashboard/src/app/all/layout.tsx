import { listProjects } from "@/lib/project";
import { AppShell } from "@/components/shell/app-shell";
import { PageError } from "@/components/page-error";

/** The "All projects" view: the same shell and sections as a project, across every project. */
export default async function AllProjectsLayout({ children }: { children: React.ReactNode }) {
  const projects = await listProjects();
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

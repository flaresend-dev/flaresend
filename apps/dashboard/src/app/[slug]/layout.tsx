import { notFound } from "next/navigation";
import { mailerCall } from "@/lib/mailer";
import { RESERVED_SLUGS } from "@/lib/nav";
import { AppShell } from "@/components/shell/app-shell";

export default async function ProjectLayout({ params, children }: { params: Promise<{ slug: string }>; children: React.ReactNode }) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) notFound();
  const [project, projects] = await Promise.all([mailerCall((m) => m.getProject(slug)), mailerCall((m) => m.listProjects())]);
  // Any error here means "no such project" to the user.
  if (!project.ok) notFound();
  return (
    <AppShell project={project.data} projects={projects.ok ? projects.data : [project.data]}>
      {children}
    </AppShell>
  );
}

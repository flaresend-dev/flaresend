import { notFound, redirect } from "next/navigation";
import { mailerCall } from "@/lib/mailer";
import { p } from "@/lib/nav";

/**
 * Old `/emails/{id}` links (bookmarks, the mailer's error messages) -> `/{slug}/emails/{id}`. The email only knows
 * its project id, so look the slug up.
 */
export default async function LegacyEmailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [email, projects] = await Promise.all([mailerCall((m) => m.getEmail(id)), mailerCall((m) => m.listProjects())]);
  if (!email.ok || !projects.ok) notFound();
  const project = projects.data.find((x) => x.id === email.data.projectId);
  if (!project) notFound();
  redirect(p(project.slug, "emails", id));
}

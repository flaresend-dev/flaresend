import { redirect } from "next/navigation";
import { ALL, link } from "@/lib/nav";
import { listProjects, type SearchParamsProp } from "@/lib/project";
import { PageError } from "@/components/page-error";

/** Contacts is shown one project at a time; open the first active project. */
export default async function AllContactsRoot({ searchParams }: SearchParamsProp) {
  const [projects, sp] = await Promise.all([listProjects(), searchParams]);
  if (!projects.ok) return <PageError title="Could not load projects" error={projects.error} />;
  const first = projects.data.find((x) => !x.disabledAt) ?? projects.data[0];
  if (!first) redirect("/projects/new");
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
  redirect(`${link(ALL, first.slug, "contacts")}${qs ? `?${qs}` : ""}`);
}

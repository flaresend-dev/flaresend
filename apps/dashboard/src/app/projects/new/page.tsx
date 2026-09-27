import { PageHeader } from "@/components/ui/page-header";
import { NewProjectForm } from "@/components/projects/new-project-form";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-[560px]">
      <PageHeader
        title="New project"
        description="A project is one sending app. It gets its own domains, API keys, webhooks, templates and contacts."
        back={{ href: "/projects", label: "Projects" }}
      />
      <NewProjectForm />
    </div>
  );
}

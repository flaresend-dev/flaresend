import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { mailerCall } from "@/lib/mailer";
import { PROJECT_COOKIE } from "@/lib/project-cookie";
import { ALL, p } from "@/lib/nav";
import { PageError } from "@/components/page-error";

/** `/` -> the last project's Emails (cookie; may be the "All projects" view), else the first project, else /projects/new. */
export default async function RootPage() {
  const last = (await cookies()).get(PROJECT_COOKIE)?.value;
  if (last === ALL) redirect(p(ALL, "emails"));
  if (last) {
    const r = await mailerCall((m) => m.getProject(last));
    if (r.ok) redirect(p(r.data.slug, "emails"));
  }
  const list = await mailerCall((m) => m.listProjects());
  if (!list.ok) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <PageError title="Could not reach the mailer" error={list.error} />
      </div>
    );
  }
  const first = list.data.find((x) => !x.disabledAt) ?? list.data[0];
  redirect(first ? p(first.slug, "emails") : "/projects/new");
}

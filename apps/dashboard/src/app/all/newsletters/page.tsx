import { redirect } from "next/navigation";
import { listProjects } from "@/lib/project";
export default async function Page() {
  const r = await listProjects();
  if (!r.ok) return <p role="alert">{r.error.message}</p>;
  const p = r.data.find((p) => !p.disabledAt) || r.data[0];
  redirect(p ? `/all/newsletters/${p.slug}` : "/projects/new");
}

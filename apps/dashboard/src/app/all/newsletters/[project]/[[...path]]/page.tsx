import { redirect } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ project: string; path?: string[] }>;
}) {
  const { project, path = [] } = await params;
  redirect(
    `/${encodeURIComponent(project)}/newsletters${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}`,
  );
}

import { redirect } from "next/navigation";
import { p } from "@/lib/nav";

export default async function ProjectRoot({ params }: { params: Promise<{ slug: string }> }) {
  redirect(p((await params).slug, "emails"));
}

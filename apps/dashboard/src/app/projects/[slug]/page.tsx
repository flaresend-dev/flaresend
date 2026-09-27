import { redirect } from "next/navigation";
import { legacyProjectHref } from "@/lib/nav";

type Sp = Record<string, string | string[] | undefined>;

/** Old `/projects/{slug}?tab=…` URLs -> the new per-section pages (section 2.3). */
export default async function LegacyProjectRedirect({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Sp> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  redirect(legacyProjectHref(slug, sp));
}

import { ArrowUpRight } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { PageError } from "@/components/page-error";
import { PublicationTabs } from "@/components/newsletters/publication-tabs";
import { PostCreate } from "@/components/newsletters/post-create";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; publicationId: string }>;
}) {
  const { slug, publicationId } = await params;
  const r = await mailerCall((m) => m.getPublication(slug, publicationId));
  if (!r.ok) return <PageError error={r.error} title="Could not load this newsletter" />;
  const p = r.data;
  const base = `/${slug}/newsletters/${publicationId}`;
  return (
    <>
      <PageHeader
        back={{ href: `/${slug}/newsletters`, label: "Newsletters" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            {p.status === "archived" ? <Badge>Archived</Badge> : null}
          </span>
        }
        description={p.description || undefined}
        actions={
          <>
            {p.siteEnabled ? (
              <a
                href={p.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-background-elevated px-3 text-sm font-medium shadow-card transition-colors hover:bg-background-hover"
              >
                <ArrowUpRight className="size-4" /> View site
              </a>
            ) : null}
            <PostCreate slug={slug} id={publicationId} disabled={p.status === "archived"} />
          </>
        }
        className="mb-4"
      />
      <PublicationTabs base={base} />
      <div className="pt-6">{children}</div>
    </>
  );
}

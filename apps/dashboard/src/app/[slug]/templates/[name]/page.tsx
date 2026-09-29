import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { mailerCall } from "@/lib/mailer";
import { linker } from "@/lib/project";
import { examplesFromVariables } from "@/lib/template-vars";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Notice } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code";
import { PageError } from "@/components/page-error";
import { HtmlFrame } from "@/components/content-viewer";
import { TemplateEditor } from "@/components/template-editor";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  return { title: decodeURIComponent((await params).name) };
}

export default async function TemplatePage({ params }: { params: Promise<{ slug: string; name: string; view?: string }> }) {
  const { slug, name: raw, view } = await params;
  const to = linker(slug, view);
  const name = decodeURIComponent(raw);
  const list = await mailerCall((m) => m.listTemplates(slug));
  if (!list.ok) return <PageError error={list.error} title="Could not load templates" />;
  // An editable template shadows a built-in one with the same name.
  const t = list.data.find((x) => x.name === name && x.source === "db") ?? list.data.find((x) => x.name === name);
  if (!t) notFound();

  if (t.source === "db") {
    const versions = await mailerCall((m) => m.templateVersions(slug, t.name));
    return <TemplateEditor key={`${t.name}-${t.version}`} slug={slug} template={t} versions={versions.ok ? versions.data : []} />;
  }

  // Built-in: read-only preview rendered with the example data.
  const data = examplesFromVariables(t.variables);
  const r = await mailerCall((m) => m.renderTemplate(slug, t.name, data));
  return (
    <>
      <PageHeader
        back={{ href: to("templates"), label: "Templates" }}
        title={
          <span className="flex items-center gap-2.5">
            <span className="font-mono">{t.name}</span>
            <Badge>Built in</Badge>
          </span>
        }
      />
      <Notice tone="info" icon={<Info />} className="mb-6">
        Built-in template. Edit it in <code>packages/templates</code> and redeploy the mailer. To change it here, create an editable template with the same name.
      </Notice>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 overflow-hidden">
          {r.ok ? (
            <>
              <div className="border-b border-border px-5 py-3 text-sm">
                <span className="text-foreground-muted">Subject </span>
                <span className="font-medium">{r.data.subject}</span>
              </div>
              <div className="p-4">
                <HtmlFrame title={`${t.name} preview`} html={r.data.html} />
                <details className="group mt-4">
                  <summary className="w-fit cursor-pointer list-none text-xs font-medium text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show plain text</span>
                    <span className="hidden group-open:inline">Hide plain text</span>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-background-subtle p-4 font-mono text-xs">{r.data.text}</pre>
                </details>
              </div>
            </>
          ) : (
            <div className="p-4">
              <PageError error={r.error} title="Render failed" />
            </div>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Example data</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CodeBlock code={JSON.stringify(data, null, 2)} />
            {t.variables.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {t.variables.map((v) => (
                  <li key={v.name} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{v.name}</span>
                    <span className="text-xs text-foreground-muted">{v.required ? "Required" : "Optional"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

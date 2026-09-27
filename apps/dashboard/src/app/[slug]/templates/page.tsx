import { LayoutTemplate, Plus } from "lucide-react";
import type { TemplateVariable } from "@flaresend/types";
import { mailerCall } from "@/lib/mailer";
import type { SlugParams } from "@/lib/project";
import { p } from "@/lib/nav";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { PageError } from "@/components/page-error";

export const metadata = { title: "Templates" };

function Variables({ vars }: { vars: TemplateVariable[] }) {
  if (!vars.length) return <span className="text-foreground-subtle">—</span>;
  const shown = vars.slice(0, 4);
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {shown.map((v) => (
        <Badge key={v.name} mono>
          {v.name}
          {v.required ? "*" : ""}
        </Badge>
      ))}
      {vars.length > 4 ? <span className="text-xs text-foreground-muted">+{vars.length - 4}</span> : null}
    </span>
  );
}

export default async function TemplatesPage({ params }: SlugParams) {
  const { slug } = await params;
  const list = await mailerCall((m) => m.listTemplates(slug));
  const newButton = (
    <LinkButton href={p(slug, "templates", "new")} variant="primary">
      <Plus /> New template
    </LinkButton>
  );
  return (
    <>
      <PageHeader
        title="Templates"
        description="Built-in templates ship with the mailer. Editable templates are stored in the database and take precedence over a built-in template with the same name."
        actions={newButton}
      />
      {!list.ok ? (
        <PageError error={list.error} title="Could not load templates" />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<LayoutTemplate />} title="No templates yet" action={newButton}>
          Write a template once and send it by name with your own data.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH className="w-[20%]">Name</TH>
              <TH className="w-[100px]">Type</TH>
              <TH>Subject</TH>
              <TH className="hidden w-[26%] lg:table-cell">Variables</TH>
              <TH className="hidden w-[80px] md:table-cell">Version</TH>
              <TH className="hidden w-[100px] text-right md:table-cell">Updated</TH>
            </tr>
          </THead>
          <TBody>
            {list.data.map((t) => (
              <TR key={`${t.source}-${t.name}`} href={p(slug, "templates", t.name)} label={`Open template ${t.name}`}>
                <TD className="truncate font-mono text-xs font-medium">{t.name}</TD>
                <TD>{t.source === "db" ? <Badge tone="violet">Editable</Badge> : <Badge>Built in</Badge>}</TD>
                <TD className="truncate text-foreground-muted">{t.subject}</TD>
                <TD className="hidden lg:table-cell">
                  <Variables vars={t.variables} />
                </TD>
                <TD className="hidden tabular-nums text-foreground-muted md:table-cell">{t.version ?? "—"}</TD>
                <TD className="hidden text-right text-foreground-muted md:table-cell">
                  <Time iso={t.updatedAt} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

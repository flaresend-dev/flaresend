import type { Command } from "commander";
import type { ProjectRecord } from "@flaresend/types";
import { buildCreateProjectBody, buildUpdateProjectBody, type ProjectOptions } from "../bodies";
import { ctx, enc } from "../context";
import { keyValues, list, table } from "../format";

export function projectDetails(p: ProjectRecord): string {
  return keyValues([
    ["Slug", p.slug],
    ["Name", p.name],
    ["ID", p.id],
    ["Status", p.disabledAt ? `disabled (${p.disabledAt})` : "active"],
    ["Default from", p.defaultFrom],
    ["Allowed domains", list(p.allowedDomains)],
    ["Allowed senders", p.allowedSenders ? list(p.allowedSenders) : "any address on the allowed domains"],
    ["RPC enabled", p.rpcEnabled ? "yes" : "no"],
    ["Daily limit", p.dailyLimit ? p.dailyLimit : "none"],
    ["Track opens", p.trackOpens ? "yes" : "no"],
    ["Track clicks", p.trackClicks ? "yes" : "no"],
    ["Created", p.createdAt],
    ["Updated", p.updatedAt],
  ]);
}

function addProjectFlags(cmd: Command): Command {
  return cmd
    .option("--domains <list>", "allowed sending domains, comma-separated (a.com,b.com)")
    .option("--default-from <address>", 'default From, e.g. "Acme <hello@acme.com>"')
    .option("--senders <list>", "allowed sender addresses, comma-separated (default: any address on the domains)")
    .option("--daily-limit <n>", "max emails per day (0 = no limit)")
    .option("--rpc", "enable RPC sending")
    .option("--no-rpc", "disable RPC sending");
}

export function registerProjects(program: Command): void {
  const projects = program.command("projects").description("manage projects (admin key)");

  projects
    .command("list")
    .description("list all projects")
    .action(async (_opts, cmd: Command) => {
      const c = ctx(cmd);
      const res = await c.admin().get<{ data: ProjectRecord[] }>("/v1/admin/projects");
      c.print(res, (r) =>
        r.data.length === 0
          ? "No projects yet. Create one with: flaresend projects create --slug <slug> --name <name> --domains <domain>"
          : table(
              ["SLUG", "NAME", "DOMAINS", "DEFAULT FROM", "RPC", "DAILY LIMIT", "STATUS"],
              r.data.map((p) => [
                p.slug,
                p.name,
                list(p.allowedDomains),
                p.defaultFrom,
                p.rpcEnabled ? "yes" : "no",
                p.dailyLimit || "none",
                p.disabledAt ? "disabled" : "active",
              ]),
              { maxWidths: [undefined, 30, 40, 40] },
            ),
      );
    });

  addProjectFlags(
    projects
      .command("create")
      .description("create a project")
      .option("--slug <slug>", "lowercase letters, digits and dashes")
      .option("--name <name>", "display name"),
  ).action(async (opts: ProjectOptions, cmd: Command) => {
    const c = ctx(cmd);
    const body = buildCreateProjectBody(opts);
    const p = await c.admin().post<ProjectRecord>("/v1/admin/projects", body);
    c.print(p, (x) => `Created project ${x.slug}\n\n${projectDetails(x)}\n\nNext: flaresend keys create --project ${x.slug} --name <name>`);
  });

  projects
    .command("show <slug>")
    .description("show one project")
    .action(async (slug: string, _opts, cmd: Command) => {
      const c = ctx(cmd);
      const p = await c.admin().get<ProjectRecord>(`/v1/admin/projects/${enc(slug)}`);
      c.print(p, projectDetails);
    });

  addProjectFlags(
    projects
      .command("update <slug>")
      .description('change a project (pass "" to --default-from or --senders to clear them)')
      .option("--name <name>", "display name"),
  ).action(async (slug: string, opts: ProjectOptions, cmd: Command) => {
    const c = ctx(cmd);
    const body = buildUpdateProjectBody(opts);
    const p = await c.admin().patch<ProjectRecord>(`/v1/admin/projects/${enc(slug)}`, body);
    c.print(p, (x) => `Updated project ${x.slug}\n\n${projectDetails(x)}`);
  });

  projects
    .command("disable <slug>")
    .description("disable a project (its keys stop working; nothing is deleted)")
    .action(async (slug: string, _opts, cmd: Command) => {
      const c = ctx(cmd);
      const p = await c.admin().delete<ProjectRecord>(`/v1/admin/projects/${enc(slug)}`);
      c.print(p, (x) => `Disabled project ${x.slug} at ${x.disabledAt ?? "now"}`);
    });

  projects
    .command("enable <slug>")
    .description("re-enable a disabled project")
    .action(async (slug: string, _opts, cmd: Command) => {
      const c = ctx(cmd);
      const p = await c.admin().patch<ProjectRecord>(`/v1/admin/projects/${enc(slug)}`, { disabled: false });
      c.print(p, (x) => `Enabled project ${x.slug}`);
    });
}

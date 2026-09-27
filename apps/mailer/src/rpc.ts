// MailerRpc: the service-binding entrypoint other Workers call. A thin adapter over core/.
import { WorkerEntrypoint } from "cloudflare:workers";
import type { BatchDryRunResult, BatchResult, EmailRecord, ListEmailsQuery, ListResponse, SendEmailInput, SendEmailResult } from "@flaresend/types";
import { sendBatch } from "./core/batch";
import { cancelEmail, getEmailRecord, listEmailRecords, parseListEmailsQuery } from "./core/emails";
import { sendEmail, type SendContext } from "./core/send";
import { getProjectBySlug, type ProjectRow } from "./db/projects";
import { ApiError, toRpcError } from "./http/errors";

export async function resolveRpcProject(env: Env, slug: string): Promise<ProjectRow> {
  if (typeof slug !== "string" || !slug) throw ApiError.validation("invalid_body", "project slug is required", "project");
  const project = await getProjectBySlug(env.DB, slug);
  if (!project) throw ApiError.notFound("project_not_found", `project "${slug}" not found`, "project");
  if (project.disabled_at) throw ApiError.permission("project_disabled", "this project is disabled");
  if (project.rpc_enabled !== 1) throw ApiError.permission("rpc_disabled", "this project may not be used over the service binding");
  return project;
}

export class MailerRpc extends WorkerEntrypoint<Env> {
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw toRpcError(err);
    }
  }

  private async ctxFor(project: string, source: SendContext["source"] = "rpc"): Promise<SendContext> {
    return {
      project: await resolveRpcProject(this.env, project),
      mode: "live",
      source,
      apiKeyId: null,
      waitUntil: (p) => this.ctx.waitUntil(p),
    };
  }

  async send(project: string, input: SendEmailInput): Promise<SendEmailResult> {
    return this.run(async () => sendEmail(this.env, await this.ctxFor(project), input));
  }

  /** Max 100. `opts` supports the same whole-batch idempotency key and dry run as the HTTP route. */
  async sendBatch(project: string, inputs: SendEmailInput[], opts?: { idempotencyKey?: string; dryRun?: boolean }): Promise<BatchResult | BatchDryRunResult> {
    return this.run(async () => sendBatch(this.env, await this.ctxFor(project, "batch"), inputs, opts ?? {}));
  }

  async get(project: string, emailId: string): Promise<EmailRecord | null> {
    return this.run(async () => {
      const p = await resolveRpcProject(this.env, project);
      try {
        return await getEmailRecord(this.env, emailId, p.id);
      } catch (err) {
        if (err instanceof ApiError && err.code === "email_not_found") return null;
        throw err;
      }
    });
  }

  async list(project: string, query: ListEmailsQuery = {}): Promise<ListResponse<EmailRecord>> {
    return this.run(async () => {
      const p = await resolveRpcProject(this.env, project);
      return listEmailRecords(this.env, parseListEmailsQuery(query), p.id);
    });
  }

  async cancel(project: string, emailId: string): Promise<{ id: string; status: "canceled" }> {
    return this.run(async () => {
      const p = await resolveRpcProject(this.env, project);
      return cancelEmail(this.env, emailId, p.id);
    });
  }
}

import { z } from "zod";

export const TemplateVariable = z.object({
  name: z.string().min(1),
  required: z.boolean().default(false),
  example: z.unknown().optional(),
});
export type TemplateVariable = z.infer<typeof TemplateVariable>;

const TemplateName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/, "name must be lowercase letters, digits, - and _");

export const CreateTemplateInput = z.object({
  name: TemplateName,
  subject: z.string().min(1).max(998),
  html: z.string().min(1),
  text: z.string().optional(),
  variables: z.array(TemplateVariable).optional(),
});
export type CreateTemplateInput = z.input<typeof CreateTemplateInput>;

export const UpdateTemplateInput = z.object({
  subject: z.string().min(1).max(998).optional(),
  html: z.string().min(1).optional(),
  text: z.string().nullable().optional(),
  variables: z.array(TemplateVariable).optional(),
});
export type UpdateTemplateInput = z.input<typeof UpdateTemplateInput>;

export interface TemplateRecord {
  id: string | null; // null for Git templates
  source: "db" | "git";
  projectId: string | null;
  name: string;
  subject: string;
  html: string | null;
  text: string | null;
  variables: TemplateVariable[];
  version: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TemplateVersionRecord {
  templateId: string;
  version: number;
  subject: string;
  html: string;
  text: string | null;
  variables: TemplateVariable[];
  createdAt: string;
}

export const RenderTemplateInput = z.object({ data: z.record(z.unknown()).default({}) });
export const RestoreTemplateInput = z.object({ version: z.number().int().min(1) });

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

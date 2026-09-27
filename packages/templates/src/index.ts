import { createElement, type ComponentType } from "react";
import { render } from "@react-email/render";
import { z } from "zod";
import { Invoice, PreviewProps as invoiceExample } from "./emails/invoice";
import { MagicLink, PreviewProps as magicLinkExample } from "./emails/magic-link";
import { Notification, PreviewProps as notificationExample } from "./emails/notification";
import { PasswordReset, PreviewProps as passwordResetExample } from "./emails/password-reset";
import { Welcome, PreviewProps as welcomeExample } from "./emails/welcome";

export interface TemplateDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** One line shown in the dashboard. */
  description: string;
  /** Validates and fills defaults for the `data` sent with the email. */
  schema: S;
  /** Subject used when the send request does not set one. */
  subject: (data: z.output<S>) => string;
  /** The React Email component. It receives the parsed data as props. */
  component: ComponentType<z.output<S>>;
  /** Valid example data, used by tests and by the dashboard's example renders. */
  example: z.input<S>;
}

/** Identity helper so each entry's `subject`, `component` and `example` are typed from its schema. */
function defineTemplate<S extends z.ZodTypeAny>(definition: TemplateDefinition<S>): TemplateDefinition<S> {
  return definition;
}

export const templates = {
  welcome: defineTemplate({
    description: "Sent after sign-up. Greets the user and links to the login page.",
    schema: z.object({ name: z.string(), appName: z.string(), loginUrl: z.string().url() }),
    subject: (d) => `Welcome to ${d.appName}`,
    component: Welcome,
    example: welcomeExample,
  }),
  "password-reset": defineTemplate({
    description: "Password reset link with an expiry time.",
    schema: z.object({
      name: z.string().optional(),
      resetUrl: z.string().url(),
      expiresInMinutes: z.number().default(30),
    }),
    subject: () => "Reset your password",
    component: PasswordReset,
    example: passwordResetExample,
  }),
  "magic-link": defineTemplate({
    description: "One-time sign-in link with an expiry time.",
    schema: z.object({ loginUrl: z.string().url(), expiresInMinutes: z.number().default(15) }),
    subject: () => "Your sign-in link",
    component: MagicLink,
    example: magicLinkExample,
  }),
  notification: defineTemplate({
    description: "Generic notice: a title, a plain-text body and an optional button.",
    schema: z.object({
      title: z.string(),
      body: z.string(),
      ctaText: z.string().optional(),
      ctaUrl: z.string().url().optional(),
    }),
    subject: (d) => d.title,
    component: Notification,
    example: notificationExample,
  }),
  invoice: defineTemplate({
    description: "Invoice with line items, total, due date and an optional pay link.",
    schema: z.object({
      invoiceNumber: z.string(),
      amount: z.string(),
      dueDate: z.string(),
      items: z.array(z.object({ description: z.string(), amount: z.string() })),
      payUrl: z.string().url().optional(),
    }),
    subject: (d) => `Invoice ${d.invoiceNumber}`,
    component: Invoice,
    example: invoiceExample,
  }),
} as const;

type Templates = typeof templates;

export type TemplateName = keyof Templates;

/** The data a caller sends for template `N` (schema input: fields with defaults are optional). */
export type TemplateData<N extends TemplateName> = z.input<Templates[N]["schema"]>;

/** Template name -> data shape. Pass to the client's `TypedSend<TemplateMap>`. */
export type TemplateMap = { [N in TemplateName]: TemplateData<N> };

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateInfo {
  name: TemplateName;
  description: string;
  example: unknown;
  /** Top-level keys of the template's data schema. */
  fields: string[];
}

export const templateNames = Object.keys(templates) as TemplateName[];

export function isTemplateName(name: string): name is TemplateName {
  return Object.prototype.hasOwnProperty.call(templates, name);
}

/**
 * Validates `data` against the template's schema, then renders HTML and plain text.
 * Throws the `ZodError` from `schema.parse` when the data is invalid, so the caller
 * can report `error.issues[0].path`.
 */
export async function renderTemplate(name: TemplateName, data: unknown): Promise<RenderedTemplate> {
  if (!isTemplateName(name)) {
    throw new Error(`Unknown template: ${String(name)}`);
  }
  // Widen to the base definition type; each entry is internally consistent.
  const template = templates[name] as unknown as TemplateDefinition;
  const parsed: unknown = template.schema.parse(data);
  const element = createElement(template.component as ComponentType<unknown>, parsed as never);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: template.subject(parsed), html, text };
}

export function listTemplates(): TemplateInfo[] {
  return templateNames.map((name) => {
    const template = templates[name] as unknown as TemplateDefinition;
    const shape = template.schema instanceof z.ZodObject ? (template.schema.shape as Record<string, unknown>) : {};
    return {
      name,
      description: template.description,
      example: template.example,
      fields: Object.keys(shape),
    };
  });
}

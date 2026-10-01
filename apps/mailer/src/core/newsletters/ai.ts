// Writing help on Workers AI. Every result is a suggestion: the dashboard shows it and the user keeps or discards it.
// Model output is untrusted text. It reaches a post only through the editor's Markdown parser and the normal
// document validation on save.
import {
  NewsletterAiInput,
  type NewsletterAiResult,
} from "@flaresend/types";
import { z } from "zod";
import type { ProjectRow } from "../../db/projects";
import { ApiError } from "../../http/errors";
import { nowIso } from "../ids";
import { aiReady } from "./policy";
import { active, one, parse, rate, requirePublication, type PublicationRow } from "./shared";

type AiInput = z.output<typeof NewsletterAiInput>;
type Message = { role: "system" | "user"; content: string };

/** The only code that calls env.AI. Tests replace `aiProvider.run` with vi.spyOn. */
export const aiProvider = {
  run: (env: Env, model: string, input: Record<string, unknown>): Promise<unknown> =>
    (env as unknown as { AI: { run(m: string, i: unknown): Promise<unknown> } }).AI.run(model, input),
};

const DEFAULT_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

function vars(env: Env) {
  const e = env as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof e[k] === "string" && e[k] ? (e[k] as string) : undefined);
  return {
    text: str("NEWSLETTER_AI_MODEL") ?? DEFAULT_TEXT_MODEL,
    vision: str("NEWSLETTER_AI_VISION_MODEL") ?? DEFAULT_VISION_MODEL,
    hourly: Number(str("NEWSLETTER_AI_HOURLY_LIMIT") ?? 120) || 120,
  };
}

export function systemMessage(p: Pick<PublicationRow, "name" | "description" | "ai_instructions">): string {
  return [
    `You write for the email newsletter "${p.name}".`,
    `About this newsletter: ${p.description.trim() || "No description."}`,
    `Voice and style notes from the publisher: ${p.ai_instructions?.trim() || "None."}`,
    "",
    "Rules:",
    "- Write in the language of the user's text unless asked to translate.",
    '- Output Markdown only. Allowed: paragraphs, "## " and "### " headings, "- " lists, "1. " lists, "> " quotes, **bold**, *italic*, [links](https://…), and "---" as a divider.',
    '- Never output HTML, tables, code blocks, images, or a top-level "# " heading.',
    "- Do not invent facts, numbers, names, quotes or links. If the notes lack a fact, write around it.",
    "- You may greet the reader with {{firstName|there}} exactly in that form. Use it at most once.",
    "- No preamble and no closing remark. Output only the requested text.",
  ].join("\n");
}

const WORDS = { short: 150, medium: 400, long: 800 } as const;
const TOKENS = { short: 400, medium: 900, long: 1600 } as const;
const REWRITE: Record<string, (i: Extract<AiInput, { action: "rewrite" }>) => string> = {
  improve: () => "Improve clarity and flow. Keep the meaning and the length.",
  fix: () => "Fix spelling and grammar only. Change nothing else.",
  shorter: () => "Make it about half as long.",
  longer: () => "Make it about twice as long. Add no new facts.",
  tone: (i) => `Change the tone to ${i.tone ?? "friendly"}.`,
  translate: (i) => `Translate it to ${i.language || "English"}.`,
  custom: (i) => i.custom?.trim() || "Improve it.",
};

/** The messages and token budget for draft, continue and rewrite. */
export function textPrompt(p: PublicationRow, input: AiInput): { messages: Message[]; maxTokens: number } {
  const system: Message = { role: "system", content: systemMessage(p) };
  switch (input.action) {
    case "draft":
      return {
        messages: [
          system,
          {
            role: "user",
            content: `Write a newsletter post from these notes. Tone: ${input.tone}. Length: about ${WORDS[input.length]} words. Line 1: a title in plain text, at most 80 characters. Line 2: a one-sentence subtitle in plain text. Line 3: empty. Then the body.\n\nNotes:\n${input.brief}`,
          },
        ],
        maxTokens: TOKENS[input.length],
      };
    case "continue":
      return {
        messages: [
          system,
          {
            role: "user",
            content: `Continue this post. Write the next part only, about 120 words${input.instruction ? `, following this instruction: ${input.instruction}` : ""}. Do not repeat what is already written.\n\nTitle: ${input.title}\n\n${input.before.slice(-12000)}`,
          },
        ],
        maxTokens: 800,
      };
    case "rewrite":
      return {
        messages: [
          system,
          {
            role: "user",
            content: `Rewrite the text below. ${REWRITE[input.instruction]!(input)} Keep the Markdown structure and any {{…}} tokens.\n\n${input.text}`,
          },
        ],
        maxTokens: Math.min(1600, Math.max(200, Math.ceil(input.text.length / 2))),
      };
    default:
      throw ApiError.validation("invalid_action", "This action does not produce text.");
  }
}

async function prepare(env: Env, project: ProjectRow, publicationId: string, raw: unknown) {
  if (!aiReady(env))
    throw ApiError.conflict("ai_unavailable", "Add the Workers AI binding to the mailer to use AI.");
  const p = await requirePublication(env, project.id, publicationId);
  active(project, p);
  const input = parse(NewsletterAiInput, raw);
  await rate(
    env,
    `ai:${project.id}`,
    nowIso().slice(0, 13),
    vars(env).hourly,
    "You reached this hour's AI limit for the project. Try again later.",
    "ai_rate_limited",
  );
  return { p, input };
}

function failed(err: unknown): never {
  if (err instanceof ApiError) throw err;
  console.error("workers ai failed", { error: String(err) });
  throw ApiError.internal("The AI model did not answer. Try again.", "ai_failed");
}

/** Turns a Workers AI event stream (either response shape) into plain UTF-8 text. */
export function sseToText(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const emit = (line: string, out: TransformStreamDefaultController<Uint8Array>) => {
    const data = line.trim();
    if (!data.startsWith("data:")) return;
    const body = data.slice(5).trim();
    if (!body || body === "[DONE]") return;
    try {
      const json = JSON.parse(body) as {
        response?: unknown;
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      const piece =
        typeof json.response === "string"
          ? json.response
          : typeof json.choices?.[0]?.delta?.content === "string"
            ? (json.choices[0].delta!.content as string)
            : "";
      if (piece) out.enqueue(encoder.encode(piece));
    } catch {
      /* a keep-alive or a partial line; ignore */
    }
  };
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, out) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) emit(line, out);
      },
      flush(out) {
        buffer += decoder.decode();
        if (buffer) emit(buffer, out);
      },
    }),
  );
}

function responseText(result: unknown): string {
  const r = result as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> };
  if (typeof r?.response === "string") return r.response;
  if (r?.response && typeof r.response === "object") return JSON.stringify(r.response);
  const c = r?.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : "";
}

/** Streaming text for draft, continue and rewrite. */
export async function aiStream(
  env: Env,
  project: ProjectRow,
  publicationId: string,
  raw: unknown,
): Promise<ReadableStream<Uint8Array>> {
  const { p, input } = await prepare(env, project, publicationId, raw);
  const { messages, maxTokens } = textPrompt(p, input);
  try {
    const stream = (await aiProvider.run(env, vars(env).text, {
      messages,
      max_tokens: maxTokens,
      stream: true,
    })) as ReadableStream<Uint8Array>;
    return sseToText(stream);
  } catch (err) {
    failed(err);
  }
}

const Subjects = z.object({
  subjects: z
    .array(z.object({ subject: z.string().min(1).max(200), previewText: z.string().max(300).default("") }))
    .min(1),
});

/** Parses the fallback format: one "subject | preview text" pair per line. */
export function parseSubjectLines(text: string) {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [subject, previewText = ""] = l
        .split("|")
        .map((s) => s.trim().replace(/^["“]|["”]$/g, "").trim());
      return { subject: subject!, previewText };
    })
    .filter((s) => s.subject)
    .slice(0, 5);
}

async function subjects(env: Env, p: PublicationRow, input: Extract<AiInput, { action: "subjects" }>) {
  const brief = `Title: ${input.title}\n\n${input.content.slice(0, 12000)}`;
  const system = systemMessage(p);
  const ask =
    "Suggest five email subject lines for this newsletter post, each with a matching preview text (the line shown after the subject in an inbox). Subjects: at most 60 characters, specific, no clickbait, no emoji, no ALL CAPS. Preview texts: at most 110 characters and different from the subject.";
  try {
    const result = await aiProvider.run(env, vars(env).text, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: `${ask}\n\n${brief}` },
      ],
      max_tokens: 600,
      response_format: {
        type: "json_schema",
        json_schema: {
          type: "object",
          properties: {
            subjects: {
              type: "array",
              items: {
                type: "object",
                properties: { subject: { type: "string" }, previewText: { type: "string" } },
                required: ["subject", "previewText"],
              },
            },
          },
          required: ["subjects"],
        },
      },
    });
    const parsed = Subjects.safeParse(JSON.parse(responseText(result)));
    if (parsed.success) return parsed.data.subjects.slice(0, 5);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // JSON mode can fail ("JSON Mode couldn't be met"); fall through to plain lines.
  }
  try {
    const result = await aiProvider.run(env, vars(env).text, {
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${ask} Output exactly five lines and nothing else. Each line: subject | preview text\n\n${brief}`,
        },
      ],
      max_tokens: 600,
    });
    const list = parseSubjectLines(responseText(result));
    if (list.length) return list;
  } catch (err) {
    failed(err);
  }
  failed(new Error("no subjects parsed"));
}

async function altText(env: Env, project: ProjectRow, p: PublicationRow, assetId: string) {
  const asset = await one<{ r2_key: string; mime_type: string }>(
    env.DB.prepare(
      "SELECT r2_key,mime_type FROM newsletter_assets WHERE id=? AND publication_id=? AND project_id=? AND status!='deleted'",
    ).bind(assetId, p.id, project.id),
  );
  if (!asset) throw ApiError.notFound("asset_not_found", "The image was not found.");
  const object = await env.PAYLOADS.get(asset.r2_key);
  if (!object) throw ApiError.notFound("asset_not_found", "The image was not found.");
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const image = `data:${asset.mime_type};base64,${btoa(binary)}`;
  const model = vars(env).vision;
  const run = () =>
    aiProvider.run(env, model, {
      messages: [
        {
          role: "user",
          content:
            "Write alt text for this image in a newsletter: one plain sentence, at most 125 characters, describing what matters. Do not start with 'Image of' or 'Picture of'.",
        },
      ],
      image,
      max_tokens: 80,
    });
  let result: unknown;
  try {
    result = await run();
  } catch (err) {
    // Meta's Llama vision models need a one-time licence agreement per account.
    if (!/agree|licen[cs]e/i.test(String(err))) failed(err);
    try {
      await aiProvider.run(env, model, { prompt: "agree" });
      result = await run();
    } catch (again) {
      failed(again);
    }
  }
  return responseText(result)
    .replace(/^(an? )?(image|picture|photo) of /i, "")
    .replace(/^"|"$/g, "")
    .trim()
    .slice(0, 125);
}

/** Non-streaming entry point for every action (the SDK and the dashboard's subject and alt-text calls). */
export async function aiRun(
  env: Env,
  project: ProjectRow,
  publicationId: string,
  raw: unknown,
): Promise<NewsletterAiResult> {
  const { p, input } = await prepare(env, project, publicationId, raw);
  if (input.action === "subjects") return { subjects: await subjects(env, p, input) };
  if (input.action === "alt-text") return { altText: await altText(env, project, p, input.assetId) };
  const { messages, maxTokens } = textPrompt(p, input);
  try {
    const result = await aiProvider.run(env, vars(env).text, { messages, max_tokens: maxTokens });
    return { text: responseText(result).trim() };
  } catch (err) {
    failed(err);
  }
}

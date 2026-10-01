import { beforeEach, describe, expect, it, vi } from "vitest";
import { env, setupProject, type TestProject } from "../helpers";
import * as pubs from "../../src/core/newsletters/publications";
import {
  aiProvider,
  aiRun,
  aiStream,
  parseSubjectLines,
  sseToText,
} from "../../src/core/newsletters/ai";

// The tests never reach Workers AI: aiProvider.run is replaced. A stand-in binding makes the feature "available".
const aiEnv = { ...env, AI: {}, NEWSLETTER_AI_HOURLY_LIMIT: "3" } as unknown as Env;

let p: TestProject, pub: Awaited<ReturnType<typeof pubs.createPublication>>;
beforeEach(async () => {
  p = await setupProject();
  pub = await pubs.createPublication(env, p.project, {
    name: "Field Notes",
    slug: "field-notes",
    description: "How we ship.",
  });
  pub = await pubs.updatePublication(env, p.project, pub.id, {
    expectedRevision: pub.revision,
    aiInstructions: "Plain words. British spelling.",
  });
  return () => vi.restoreAllMocks();
});

function streamOf(...chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
}
async function readAll(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text();
}

describe("newsletter AI", () => {
  it("drafts with the publication's name, description and voice notes", async () => {
    const run = vi
      .spyOn(aiProvider, "run")
      .mockResolvedValue({ response: "Title\nSubtitle\n\nBody" });
    const result = await aiRun(aiEnv, p.project, pub.id, {
      action: "draft",
      brief: "- faster deploys",
    });
    expect(result).toEqual({ text: "Title\nSubtitle\n\nBody" });
    const [, model, input] = run.mock.calls[0]!;
    expect(model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    const messages = (input as { messages: Array<{ role: string; content: string }> }).messages;
    expect(messages[0]!.content).toContain('"Field Notes"');
    expect(messages[0]!.content).toContain("How we ship.");
    expect(messages[0]!.content).toContain("British spelling");
    expect(messages[1]!.content).toContain("about 400 words");
  });
  it("streams plain text from either event shape", async () => {
    vi.spyOn(aiProvider, "run").mockResolvedValue(
      streamOf(
        'data: {"response":"Hel"}\n\ndata: {"choi',
        'ces":[{"delta":{"content":"lo"}}]}\n\n',
        "data: [DONE]\n\n",
      ),
    );
    const stream = await aiStream(aiEnv, p.project, pub.id, {
      action: "rewrite",
      text: "hi",
      instruction: "improve",
    });
    expect(await readAll(stream)).toBe("Hello");
    expect(await readAll(sseToText(streamOf("data: {\"response\":\"x\"}")))).toBe("x");
  });
  it("suggests subjects with JSON mode and falls back to lines", async () => {
    const run = vi.spyOn(aiProvider, "run").mockResolvedValueOnce({
      response: {
        subjects: [
          { subject: "One", previewText: "a" },
          { subject: "Two", previewText: "b" },
        ],
      },
    });
    expect(
      (await aiRun(aiEnv, p.project, pub.id, { action: "subjects", title: "T", content: "c" }))
        .subjects,
    ).toEqual([
      { subject: "One", previewText: "a" },
      { subject: "Two", previewText: "b" },
    ]);
    run
      .mockRejectedValueOnce(new Error("JSON Mode couldn't be met"))
      .mockResolvedValueOnce({ response: "1. Alpha | first\n2. Beta | second" });
    expect(
      (await aiRun(aiEnv, p.project, pub.id, { action: "subjects", title: "T", content: "c" }))
        .subjects,
    ).toEqual([
      { subject: "Alpha", previewText: "first" },
      { subject: "Beta", previewText: "second" },
    ]);
    expect(parseSubjectLines('- "Gamma" | g')).toEqual([{ subject: "Gamma", previewText: "g" }]);
  });
  it("needs the Workers AI binding", async () => {
    await expect(
      aiRun({ ...env, AI: undefined } as unknown as Env, p.project, pub.id, {
        action: "draft",
        brief: "x",
      }),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });
  it("limits calls per project per hour", async () => {
    vi.spyOn(aiProvider, "run").mockResolvedValue({ response: "ok" });
    const input = { action: "continue" as const, before: "Hi" };
    for (let i = 0; i < 3; i++) await aiRun(aiEnv, p.project, pub.id, input);
    await expect(aiRun(aiEnv, p.project, pub.id, input)).rejects.toMatchObject({
      code: "ai_rate_limited",
    });
  });
  it("turns a model error into ai_failed", async () => {
    vi.spyOn(aiProvider, "run").mockRejectedValue(new Error("boom"));
    await expect(
      aiRun(aiEnv, p.project, pub.id, { action: "continue", before: "Hi" }),
    ).rejects.toMatchObject({ code: "ai_failed" });
  });
});

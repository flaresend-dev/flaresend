"use client";
import type { NewsletterAiInput } from "@flaresend/types";

/** Reads AI text from /api/newsletter-ai. Calls `onText` with the whole text so far. Throws the server's message. */
export async function streamAi(
  slug: string,
  publicationId: string,
  input: NewsletterAiInput,
  onText: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/newsletter-ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, publicationId, input }),
    signal,
  });
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message ?? `AI request failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  text += decoder.decode();
  onText(text);
  return text;
}

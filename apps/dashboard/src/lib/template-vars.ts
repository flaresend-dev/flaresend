// Template variable helpers shared by the server tab and the client editor. Pure; unit tested.
import type { TemplateVariable } from "@flaresend/types";

/** { name: example } for every variable that has an example. Dotted names become nested objects. */
export function examplesFromVariables(vars: Array<Pick<TemplateVariable, "name" | "example">>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of vars) {
    if (v.example === undefined) continue;
    const parts = v.name.split(".");
    let cur = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = v.example;
      else {
        if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
        cur = cur[p] as Record<string, unknown>;
      }
    });
  }
  return out;
}

/**
 * The editor keeps each example as text. JSON is parsed ("42" -> 42, '["a"]' -> array); anything that is not
 * valid JSON is used as a plain string, so typing `Ada` works without quotes. Empty -> no example.
 */
export function parseExample(text: string): unknown {
  const t = text.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return text;
  }
}

export function exampleToText(v: unknown): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

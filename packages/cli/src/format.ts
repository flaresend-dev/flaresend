export type Cell = string | number | boolean | null | undefined;

export function cellText(v: Cell): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v).replace(/\r?\n/g, " ");
}

/** Shorten a string to max characters, ending with "..." when cut. */
export function truncate(s: string, max: number): string {
  if (max <= 3 || s.length <= max) return s.length <= max ? s : s.slice(0, max);
  return s.slice(0, max - 3) + "...";
}

export interface TableOptions {
  /** Per-column max width. Longer cells are cut with "...". */
  maxWidths?: Array<number | undefined>;
  /** Columns to right-align (by index). */
  alignRight?: number[];
}

/**
 * Render a plain text table:
 *
 *   ID   NAME
 *   ---  -----
 *   p_1  Happy
 */
export function table(headers: string[], rows: Cell[][], opts: TableOptions = {}): string {
  const cols = headers.length;
  const text = rows.map((r) =>
    Array.from({ length: cols }, (_, i) => {
      const t = cellText(r[i]);
      const max = opts.maxWidths?.[i];
      return max ? truncate(t, max) : t;
    }),
  );
  const widths = headers.map((h, i) => Math.max(h.length, ...text.map((r) => r[i]!.length)));
  const right = new Set(opts.alignRight ?? []);
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (right.has(i) ? c.padStart(widths[i]!) : c.padEnd(widths[i]!)))
      .join("  ")
      .trimEnd();
  const out = [line(headers), line(widths.map((w) => "-".repeat(w))), ...text.map(line)];
  return out.join("\n");
}

/** Render "key: value" pairs with the keys padded to the same width. */
export function keyValues(pairs: Array<[string, Cell]>): string {
  const width = Math.max(0, ...pairs.map(([k]) => k.length));
  return pairs.map(([k, v]) => `${(k + ":").padEnd(width + 1)}  ${cellText(v)}`).join("\n");
}

export function list(values: string[] | null | undefined): string {
  return values && values.length ? values.join(", ") : "-";
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// CSV parsing for contact import. Runs in the browser; the result is sent to importContacts as JSON. Pure; unit tested.
import type { ContactInput } from "@flaresend/types";

/** RFC 4180-ish: quoted fields, "" escapes, commas/newlines inside quotes, CRLF or LF, optional BOM. */
export function parseCsv(input: string): string[][] {
  const src = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const HEADER_ALIASES: Record<string, "email" | "firstName" | "lastName" | "unsubscribed"> = {
  email: "email",
  "e-mail": "email",
  email_address: "email",
  emailaddress: "email",
  first_name: "firstName",
  firstname: "firstName",
  first: "firstName",
  last_name: "lastName",
  lastname: "lastName",
  last: "lastName",
  unsubscribed: "unsubscribed",
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function truthyCell(v: string): boolean {
  return ["1", "true", "yes", "y"].includes(v.trim().toLowerCase());
}

export interface CsvImportResult {
  contacts: ContactInput[];
  errors: Array<{ line: number; message: string }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * First row is the header. Needs an `email` column. Known columns: email, first_name, last_name, unsubscribed.
 * Every other column goes into `data` as a string.
 */
export function csvToContacts(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const errors: CsvImportResult["errors"] = [];
  if (rows.length === 0) return { contacts: [], errors: [{ line: 1, message: "file is empty" }] };
  const header = rows[0]!.map(normHeader);
  const emailIdx = header.findIndex((h) => HEADER_ALIASES[h] === "email");
  if (emailIdx === -1) return { contacts: [], errors: [{ line: 1, message: "no email column in the header row" }] };

  const contacts: ContactInput[] = [];
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const email = (cells[emailIdx] ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      errors.push({ line, message: `invalid email "${cells[emailIdx] ?? ""}"` });
      return;
    }
    const c: ContactInput = { email };
    const data: Record<string, string> = {};
    header.forEach((h, j) => {
      if (j === emailIdx) return;
      const v = (cells[j] ?? "").trim();
      const known = HEADER_ALIASES[h];
      if (known === "firstName") c.firstName = v || null;
      else if (known === "lastName") c.lastName = v || null;
      else if (known === "unsubscribed") c.unsubscribed = truthyCell(v);
      else if (h && v) data[h] = v;
    });
    if (Object.keys(data).length) c.data = data;
    contacts.push(c);
  });
  return { contacts, errors };
}

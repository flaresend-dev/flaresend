"use client";

import { useState, useTransition } from "react";
import { FileUp, Upload } from "lucide-react";
import { csvToContacts, type CsvImportResult } from "@/lib/csv";
import { num } from "@/lib/format";
import { importContactsAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { toastResult } from "@/components/ui/toast";

export const CSV_HEADER = "email,first_name,last_name,unsubscribed";

/**
 * Import CSV dialog: drop a file (or paste), preview the first 5 parsed rows with the valid/skipped counts, then
 * import. Parsed in the browser; sent to the mailer as JSON (max 5,000 rows, upsert by email).
 */
export function ImportCsvButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<CsvImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();

  const parse = (text: string) => {
    setRaw(text);
    setParsed(text.trim() ? csvToContacts(text) : null);
  };
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    parse(await f.text());
  };
  const reset = () => {
    setRaw("");
    setFileName(null);
    setParsed(null);
  };
  const valid = parsed?.contacts.length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload /> Import CSV
      </Button>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            A header row with an <code className="font-mono text-xs">email</code> column is required. Known columns: first_name, last_name, unsubscribed
            (true/yes/1). Other columns go into the contact&apos;s data. Existing emails are updated.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void readFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
              dragging ? "border-brand bg-background-hover" : "border-border-strong hover:bg-background-hover",
            )}
          >
            <FileUp className="size-6 text-foreground-muted" />
            <span className="text-sm font-medium">{fileName ?? "Drop a CSV file here, or click to choose one"}</span>
            <span className="text-xs text-foreground-muted">Up to 5,000 rows per import</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} />
          </label>
          <details className="group">
            <summary className="w-fit cursor-pointer list-none text-xs font-medium text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
              Or paste CSV text
            </summary>
            <Textarea
              className="mt-2 font-mono text-xs"
              value={raw}
              onChange={(e) => {
                setFileName(null);
                parse(e.target.value);
              }}
              rows={5}
              placeholder={`${CSV_HEADER},company\nada@example.com,Ada,Lovelace,false,Analytical`}
            />
          </details>

          {parsed ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                <span className="font-medium tabular-nums">{num(valid)} valid</span>
                <span className="text-foreground-subtle"> · </span>
                <span className={cn("tabular-nums", parsed.errors.length ? "text-danger-fg" : "text-foreground-muted")}>{num(parsed.errors.length)} skipped</span>
              </p>
              {valid ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-background-subtle text-foreground-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Email</th>
                        <th className="px-3 py-2 text-left font-medium">First name</th>
                        <th className="px-3 py-2 text-left font-medium">Last name</th>
                        <th className="px-3 py-2 text-left font-medium">Subscribed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.contacts.slice(0, 5).map((c, i) => (
                        <tr key={`${c.email}-${i}`} className="border-t border-border">
                          <td className="px-3 py-1.5 font-mono">{c.email}</td>
                          <td className="px-3 py-1.5">{c.firstName ?? "—"}</td>
                          <td className="px-3 py-1.5">{c.lastName ?? "—"}</td>
                          <td className="px-3 py-1.5">{c.unsubscribed ? "No" : "Yes"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {valid > 5 ? <p className="border-t border-border px-3 py-1.5 text-xs text-foreground-muted">and {num(valid - 5)} more</p> : null}
                </div>
              ) : null}
              {parsed.errors.length ? (
                <details>
                  <summary className="w-fit cursor-pointer text-xs font-medium text-danger-fg">Show skipped lines</summary>
                  <ul className="mt-2 max-h-32 overflow-auto rounded-md border border-danger-border bg-danger-bg p-2 font-mono text-xs text-danger-fg">
                    {parsed.errors.slice(0, 100).map((e) => (
                      <li key={e.line}>
                        line {e.line}: {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={!valid}
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await importContactsAction(slug, parsed!.contacts);
                toastResult(r);
                if (r.ok) setOpen(false);
              })
            }
          >
            Import {valid ? num(valid) : ""} {valid === 1 ? "contact" : "contacts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

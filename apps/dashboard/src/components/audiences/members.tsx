"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import type { ContactRecord } from "@flaresend/types";
import { addAudienceMembersAction, removeAudienceMembersAction, searchContactsAction } from "@/app/actions";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { toastResult } from "@/components/ui/toast";

function fullName(c: ContactRecord) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

function formWith(ids: string[]) {
  const fd = new FormData();
  for (const id of ids) fd.append("contactIds", id);
  return fd;
}

/** Members table with a checkbox column; an action bar appears when any row is checked. */
export function MembersTable({ slug, audienceId, members }: { slug: string; audienceId: string; members: ContactRecord[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const all = members.length > 0 && selected.size === members.length;
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <>
      <div className={cn("mb-3 flex h-9 items-center gap-3 rounded-md border border-border bg-background-subtle px-3 text-sm transition-opacity", selected.size ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!selected.size}>
        <span className="font-medium tabular-nums">{num(selected.size)} selected</span>
        <span className="text-foreground-subtle" aria-hidden>
          ·
        </span>
        <button type="button" className="font-medium text-danger-fg hover:underline" onClick={() => setConfirm(true)}>
          Remove from audience
        </button>
        <button type="button" className="ml-auto text-xs text-foreground-muted hover:text-foreground" onClick={() => setSelected(new Set())}>
          Clear
        </button>
      </div>
      <Table>
        <THead>
          <tr>
            <TH className="w-11">
              <Checkbox
                aria-label="Select all"
                checked={all ? true : selected.size ? "indeterminate" : false}
                onCheckedChange={(v) => setSelected(v === true ? new Set(members.map((m) => m.id)) : new Set())}
              />
            </TH>
            <TH>Email</TH>
            <TH className="hidden w-[30%] md:table-cell">Name</TH>
            <TH className="w-[140px]">Status</TH>
          </tr>
        </THead>
        <TBody>
          {members.map((c) => (
            <tr key={c.id} className={cn("transition-colors hover:bg-background-hover", selected.has(c.id) && "bg-background-hover")}>
              <TD>
                <Checkbox aria-label={`Select ${c.email}`} checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
              </TD>
              <TD className="truncate font-mono text-xs">{c.email}</TD>
              <TD className="hidden truncate md:table-cell">{fullName(c) || <span className="text-foreground-subtle">—</span>}</TD>
              <TD>
                <StatusBadge status={c.unsubscribed ? "unsubscribed" : "subscribed"} />
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove ${num(selected.size)} ${selected.size === 1 ? "contact" : "contacts"} from this audience?`}
        body="The contacts themselves are kept."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => removeAudienceMembersAction(slug, audienceId, {}, formWith([...selected]))}
        onSuccess={() => setSelected(new Set())}
      />
    </>
  );
}

/** "Add contacts": searchable list of contacts, checkboxes, "Add N contacts". */
export function AddMembersButton({ slug, audienceId, memberIds }: { slug: string; audienceId: string; memberIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ContactRecord[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const members = new Set(memberIds);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchContactsAction(slug, q);
      if (stale) return;
      setLoading(false);
      if (r.ok) setResults(r.data as ContactRecord[]);
      else toastResult(r);
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [open, q, slug]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQ("");
          setPicked(new Set());
        }
      }}
    >
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UserPlus /> Add contacts
      </Button>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add contacts</DialogTitle>
          <DialogDescription>Search by email or name. Up to 50 matches are shown.</DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-3">
          <Input autoFocus type="search" placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} prefix={<Search />} aria-label="Search contacts" />
          <ul className="h-80 overflow-y-auto rounded-md border border-border" aria-busy={loading}>
            {results.length === 0 ? (
              <li className="flex h-full items-center justify-center text-sm text-foreground-muted">{loading ? "Searching…" : "No contacts found."}</li>
            ) : (
              results.map((c) => {
                const already = members.has(c.id);
                return (
                  <li key={c.id} className="border-b border-border last:border-b-0">
                    <label className={cn("flex items-center gap-3 px-3 py-2", already ? "opacity-50" : "cursor-pointer hover:bg-background-hover")}>
                      <Checkbox
                        disabled={already}
                        checked={already || picked.has(c.id)}
                        onCheckedChange={(v) =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (v === true) n.add(c.id);
                            else n.delete(c.id);
                            return n;
                          })
                        }
                      />
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate font-mono text-xs">{c.email}</span>
                        {fullName(c) ? <span className="truncate text-xs text-foreground-muted">{fullName(c)}</span> : null}
                      </span>
                      {already ? <span className="text-xs text-foreground-muted">In audience</span> : c.unsubscribed ? <StatusBadge status="unsubscribed" /> : null}
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={!picked.size}
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await addAudienceMembersAction(slug, audienceId, {}, formWith([...picked]));
                toastResult(r);
                if (r.ok) setOpen(false);
              })
            }
          >
            Add {picked.size ? num(picked.size) : ""} {picked.size === 1 ? "contact" : "contacts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

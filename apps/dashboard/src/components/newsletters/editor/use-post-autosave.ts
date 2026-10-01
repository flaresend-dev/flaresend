"use client";
// The post save queue. One request at a time; edits made during a save are saved right after it.
// Every write carries the revision it was based on, so another tab's save is never overwritten silently.
import { useCallback, useEffect, useRef, useState } from "react";
import type { NewsletterPostRecord } from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";

export type SaveState =
  | { kind: "saved"; at: Date | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; message: string };

const DEBOUNCE_MS = 900;

export function usePostAutosave(slug: string, initial: NewsletterPostRecord, opts: { paused: boolean; readOnly: boolean }) {
  const [post, setPost] = useState(initial);
  const [state, setState] = useState<SaveState>({ kind: "saved", at: null });
  const current = useRef(initial);
  const saved = useRef(initial);
  const sequence = useRef(0);
  const dirty = useRef(false);
  const inflight = useRef<Promise<boolean> | null>(null);

  const change = useCallback((patch: Partial<NewsletterPostRecord>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    sequence.current++;
    dirty.current = true;
    setPost(next);
    setState({ kind: "dirty" });
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    if (inflight.current) {
      if (!(await inflight.current)) return false;
      return dirty.current ? save() : true;
    }
    if (!dirty.current) return true;
    const version = sequence.current;
    const p = current.current;
    setState({ kind: "saving" });
    const request = (async () => {
      const r = await newsletterAction(slug, "updateNewsletterPost", p.publicationId, p.id, {
        expectedRevision: saved.current.revision,
        title: p.title,
        subtitle: p.subtitle,
        subject: p.subject,
        subjectOverridden: p.subjectOverridden,
        previewText: p.previewText,
        authorLabel: p.authorLabel,
        slug: p.slug,
        document: p.document,
      });
      if (!r.ok) {
        setState(
          r.error.code === "revision_conflict"
            ? { kind: "conflict", message: "Someone else saved this post. Your text is still here." }
            : { kind: "error", message: r.error.message },
        );
        return false;
      }
      saved.current = r.data;
      // Keep edits typed during the save; take the server's revision ids.
      const next =
        sequence.current === version
          ? { ...r.data, document: current.current.document }
          : { ...current.current, revision: r.data.revision, draftRevisionId: r.data.draftRevisionId };
      current.current = next;
      setPost(next);
      dirty.current = sequence.current !== version;
      setState(dirty.current ? { kind: "dirty" } : { kind: "saved", at: new Date() });
      return true;
    })();
    inflight.current = request;
    try {
      return await request;
    } finally {
      inflight.current = null;
    }
  }, [slug]);

  /** Replace the local copy with a server result (after a command such as cancel schedule). */
  const accept = useCallback((record: NewsletterPostRecord) => {
    saved.current = record;
    current.current = record;
    dirty.current = false;
    setPost(record);
    setState({ kind: "saved", at: new Date() });
  }, []);

  useEffect(() => {
    if (!dirty.current || opts.paused || opts.readOnly) return;
    if (state.kind === "conflict" || state.kind === "error") return;
    const t = setTimeout(() => void save(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [post, opts.paused, opts.readOnly, save, state.kind]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return { post, state, change, save, accept, current, isDirty: () => dirty.current };
}

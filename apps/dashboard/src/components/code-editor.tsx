"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { html as htmlLang } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import { cn } from "@/lib/utils";

// CodeMirror touches `document`, so it is only loaded in the browser.
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <div className="fs-skeleton h-full w-full" />,
});

/** Follows the `.dark` class on <html> (the theme toggle), not the OS setting. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** CodeMirror 6 editor. `language="html"` enables HTML highlighting; otherwise plain text. */
export function CodeEditor({ value, onChange, language, height = "320px", ariaLabel, readOnly, className }: {
  value: string;
  onChange?: (v: string) => void;
  language?: "html" | "text";
  height?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  className?: string;
}) {
  const dark = useIsDark();
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      ...(language === "html" ? [htmlLang()] : []),
      EditorView.contentAttributes.of({ "aria-label": ariaLabel ?? "code editor" }),
    ],
    [language, ariaLabel],
  );
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border-strong focus-within:border-brand focus-within:ring-2 focus-within:ring-ring",
        readOnly && "focus-within:border-border-strong focus-within:ring-0",
        className,
      )}
      style={{ height }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        editable={!readOnly}
        extensions={extensions}
        theme={dark ? "dark" : "light"}
        height={height}
        basicSetup={{ foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: !readOnly }}
      />
    </div>
  );
}

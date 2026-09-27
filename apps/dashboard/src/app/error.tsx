"use client";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-[96px] leading-none font-semibold tracking-tighter text-foreground-subtle/60 select-none">500</p>
      <h1 className="mt-4 text-title font-semibold">Something went wrong</h1>
      <CodeBlock
        className="mt-4 w-full max-w-lg text-left"
        code={`${error.message || "unknown error"}${error.digest ? `\ndigest ${error.digest}` : ""}`}
      />
      <Button variant="primary" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

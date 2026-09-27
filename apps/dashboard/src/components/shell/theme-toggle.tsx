"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, nextTheme, readTheme, type Theme } from "@/lib/theme";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const LABEL = { system: "System", light: "Light", dark: "Dark" } as const;

/** Cycles system -> light -> dark. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(readTheme()), []);
  const Icon = ICON[theme];
  return (
    <Tooltip content={`Theme: ${LABEL[theme]}`}>
      <button
        type="button"
        aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[nextTheme(theme)]}.`}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        onClick={() => {
          const t = nextTheme(theme);
          applyTheme(t);
          setTheme(t);
        }}
      >
        <Icon />
      </button>
    </Tooltip>
  );
}

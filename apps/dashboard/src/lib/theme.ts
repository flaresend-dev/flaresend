// Theme preference: "system" | "light" | "dark". Stored in localStorage `fs-theme` and mirrored to the `fs-theme`
// cookie so the server can put `class="dark"` on <html> for an explicit choice. For "system" the server renders no
// class and THEME_SCRIPT (inlined in <head>, runs before paint) adds it when the OS is dark.

export type Theme = "system" | "light" | "dark";
export const THEME_KEY = "fs-theme";
export const THEMES: Theme[] = ["system", "light", "dark"];

export function parseTheme(v: string | null | undefined): Theme {
  return v === "light" || v === "dark" ? v : "system";
}

/** The toggle cycles system -> light -> dark -> system. */
export function nextTheme(t: Theme): Theme {
  return t === "system" ? "light" : t === "light" ? "dark" : "system";
}

/** Server side: the class for <html>, or undefined when the client script decides. */
export function htmlClassFor(t: Theme): string | undefined {
  return t === "dark" ? "dark" : undefined;
}

export const THEME_SCRIPT = `(function(){try{
var d=document.documentElement,k="${THEME_KEY}";
function pref(){var m=document.cookie.match(/(?:^|; )${THEME_KEY}=([^;]+)/);return (m&&m[1])||localStorage.getItem(k)||"system";}
var mq=window.matchMedia("(prefers-color-scheme: dark)");
function apply(){var t=pref();d.classList.toggle("dark",t==="dark"||(t==="system"&&mq.matches));}
apply();
mq.addEventListener("change",apply);
}catch(e){}})();`;

/** Browser side: save the choice and update <html>. */
export function applyTheme(t: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* storage blocked; the cookie still works */
  }
  document.cookie = `${THEME_KEY}=${t}; path=/; max-age=31536000; samesite=lax`;
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function readTheme(): Theme {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_KEY}=([^;]+)`));
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    /* ignore */
  }
  return parseTheme(m?.[1] ?? stored);
}

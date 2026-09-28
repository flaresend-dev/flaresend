'use client';

import { Moon, Sun } from 'lucide-react';

/** Flips the .dark class on <html> and remembers the choice. layout.tsx applies it again before the next page paints. */
export function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  };
  // Both icons render; CSS shows the one for the other theme, so the server HTML never has to know the choice.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between dark and light mode"
      className="inline-flex size-[34px] items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-subtle hover:text-fg"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </button>
  );
}

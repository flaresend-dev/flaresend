import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/** A plain GET search box (`?q=`). `/` focuses it (data-page-search). */
export function SearchForm({ q, placeholder, className }: { q: string; placeholder: string; className?: string }) {
  return (
    <form method="get" role="search" className={cn("mb-4 max-w-md", className)}>
      <Input
        data-page-search
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        prefix={<Search />}
        suffix={<Kbd className="hidden sm:inline-flex">/</Kbd>}
        spellCheck={false}
      />
    </form>
  );
}

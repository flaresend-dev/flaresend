"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Open state for a dialog that the command palette can open with `?{param}=1`. The param is removed from the URL
 * once read, so reloading does not open the dialog again.
 */
export function useAutoOpen(param: string, enabled = true): [boolean, (open: boolean) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const flagged = enabled && sp.get(param) === "1";

  useEffect(() => {
    if (!flagged) return;
    setOpen(true);
    const next = new URLSearchParams(sp.toString());
    next.delete(param);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [flagged, param, pathname, router, sp]);

  return [open, setOpen];
}

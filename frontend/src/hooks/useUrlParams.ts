"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

type Patch = Record<string, string | number | null | undefined>;

/**
 * Table state (search, filters, sort, page) lives in the URL so views are shareable,
 * survive reloads, and are preserved by the back button.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Updates can fire faster than the router re-renders (e.g. a debounced search clearing while
  // a filter is chosen). Building each patch on the latest *requested* query string, not the
  // last rendered one, stops a stale update from resurrecting a value that was just cleared.
  const latest = useRef(params.toString());
  useEffect(() => {
    latest.current = params.toString();
  }, [params]);

  const update = useCallback(
    (patch: Patch) => {
      const next = new URLSearchParams(latest.current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      const qs = next.toString();
      latest.current = qs;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const getInt = (key: string, fallback: number) => {
    const n = Number(params.get(key));
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };

  return { params, update, getInt };
}

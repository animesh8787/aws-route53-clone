"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Patch = Record<string, string | number | null | undefined>;

/**
 * Table state (search, filters, sort, page) lives in the URL so views are shareable,
 * survive reloads, and are preserved by the back button.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = useCallback(
    (patch: Patch) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const getInt = (key: string, fallback: number) => {
    const n = Number(params.get(key));
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };

  return { params, update, getInt };
}

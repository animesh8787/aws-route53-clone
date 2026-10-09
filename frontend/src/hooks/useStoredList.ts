"use client";

import { useCallback, useState } from "react";

function read(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : fallback;
  } catch {
    return fallback;
  }
}

/** A small string list kept in localStorage (per browser). Falls back to memory when storage is unavailable. */
export function useStoredList(key: string, fallback: string[] = []) {
  const [items, setItems] = useState<string[]>(() => (typeof window === "undefined" ? fallback : read(key, fallback)));

  const save = useCallback(
    (next: string[]) => {
      setItems(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable: keep the list for this session only */
      }
    },
    [key],
  );

  return [items, save] as const;
}

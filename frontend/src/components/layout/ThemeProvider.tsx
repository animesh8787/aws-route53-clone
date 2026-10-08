"use client";

import { applyDensity, applyMode, Density, Mode } from "@cloudscape-design/global-styles";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark";
const STORAGE_KEY = "r53-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: "light", toggle: () => {} });

function readStoredMode(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    // Hydrate from localStorage once on the client (the initial render must match the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(readStoredMode());
    applyDensity(Density.Comfortable);
  }, []);

  useEffect(() => {
    applyMode(mode === "dark" ? Mode.Dark : Mode.Light);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable: preference lasts for this session only */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

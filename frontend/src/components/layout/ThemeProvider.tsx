"use client";

import { applyDensity, applyMode, Density, Mode } from "@cloudscape-design/global-styles";
import { applyTheme, type Theme } from "@cloudscape-design/components/theming";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ORANGE = { light: "#ff9900", dark: "#ff9900" };
const ORANGE_HOVER = { light: "#fa6f00", dark: "#ffac31" };
const ORANGE_ACTIVE = { light: "#e07700", dark: "#ff9900" };
const ON_ORANGE = { light: "#000716", dark: "#000716" };

const CONSOLE_THEME: Theme = {
  tokens: {
    colorBackgroundButtonPrimaryDefault: ORANGE,
    colorBorderButtonPrimaryDefault: ORANGE,
    colorTextButtonPrimaryDefault: ON_ORANGE,
    colorBackgroundButtonPrimaryHover: ORANGE_HOVER,
    colorBorderButtonPrimaryHover: ORANGE_HOVER,
    colorTextButtonPrimaryHover: ON_ORANGE,
    colorBackgroundButtonPrimaryActive: ORANGE_ACTIVE,
    colorBorderButtonPrimaryActive: ORANGE_ACTIVE,
    colorTextButtonPrimaryActive: ON_ORANGE,
  },
};

type ThemeMode = "light" | "dark";
/** "auto" follows the browser's colour scheme ("Browser default" in the console's settings menu). */
export type ThemePreference = ThemeMode | "auto";
const STORAGE_KEY = "r53-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: "light", preference: "light", setPreference: () => {}, toggle: () => {} });

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "auto" ? stored : "light";
  } catch {
    return "light";
  }
}

const systemPrefersDark = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Only the client-side console reads the preference, so a lazy read cannot cause a hydration mismatch.
  const [preference, setPreferenceState] = useState<ThemePreference>(() => (typeof window === "undefined" ? "light" : readStoredPreference()));
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  useEffect(() => {
    applyDensity(Density.Comfortable);
    // Primary actions are orange in the AWS console (Cloudscape's default is blue).
    const { reset } = applyTheme({ theme: CONSOLE_THEME });
    return reset;
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const mode: ThemeMode = preference === "auto" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    applyMode(mode === "dark" ? Mode.Dark : Mode.Light);
  }, [mode]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: preference lasts for this session only */
    }
  }, []);

  const toggle = useCallback(() => setPreference(mode === "dark" ? "light" : "dark"), [mode, setPreference]);

  const value = useMemo(() => ({ mode, preference, setPreference, toggle }), [mode, preference, setPreference, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

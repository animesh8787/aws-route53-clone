"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

/** Receives questions sent from elsewhere; `send` submits immediately instead of only filling the input. */
type AskHandler = (text: string, send: boolean) => void;

interface AssistantContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel with a question; `send` submits it straight away. */
  ask: (text: string, send?: boolean) => void;
  /** The panel registers how it handles questions; returns an unregister function. */
  registerHandler: (handler: AskHandler) => () => void;
  pageErrors: string[];
  reportError: (key: string, message: string | null) => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const handler = useRef<AskHandler | null>(null);
  const pending = useRef<{ text: string; send: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ask = useCallback((text: string, send = true) => {
    setOpen(true);
    if (handler.current) handler.current(text, send);
    else pending.current = { text, send }; // delivered when the panel mounts
  }, []);
  const registerHandler = useCallback((next: AskHandler) => {
    handler.current = next;
    const waiting = pending.current;
    pending.current = null;
    if (waiting) next(waiting.text, waiting.send);
    return () => {
      if (handler.current === next) handler.current = null;
    };
  }, []);
  const reportError = useCallback((key: string, message: string | null) => {
    setErrors((current) => {
      if (message === null) {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      return current[key] === message ? current : { ...current, [key]: message };
    });
  }, []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  const value = useMemo(
    () => ({ open, setOpen, toggle, ask, registerHandler, pageErrors: Object.values(errors), reportError }),
    [open, toggle, ask, registerHandler, errors, reportError],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

/** The assistant API, or null outside the console shell (sign-in pages). */
export const useAssistant = () => useContext(AssistantContext);

/** Registers an error message shown on the page so Amazon Q can see it as context. */
export function usePageError(message: string | null) {
  const assistant = useAssistant();
  const key = useId();
  const report = assistant?.reportError;
  useEffect(() => {
    if (!report) return;
    report(key, message);
    return () => report(key, null);
  }, [report, key, message]);
}

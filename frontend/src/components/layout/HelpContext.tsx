"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface HelpContextValue {
  topic: string | null;
  isOpen: boolean;
  open: (topic?: string) => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

const HelpContext = createContext<HelpContextValue>({ topic: null, isOpen: false, open: () => {}, close: () => {}, setOpen: () => {} });

/** State of the console's right-hand help panel; every "Info" link opens it on its own topic. */
export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback((next?: string) => {
    if (next) setTopic(next);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ topic, isOpen, open, close, setOpen: setIsOpen }), [topic, isOpen, open, close]);
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export const useHelp = () => useContext(HelpContext);

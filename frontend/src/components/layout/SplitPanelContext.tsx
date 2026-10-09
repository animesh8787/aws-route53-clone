"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface SplitPanelSpec {
  header: string;
  content: React.ReactNode;
}

interface SplitPanelContextValue {
  panel: SplitPanelSpec | null;
  setPanel: (panel: SplitPanelSpec | null) => void;
}

const SplitPanelContext = createContext<SplitPanelContextValue>({ panel: null, setPanel: () => {} });

export function SplitPanelProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<SplitPanelSpec | null>(null);
  const value = useMemo(() => ({ panel, setPanel }), [panel]);
  return <SplitPanelContext.Provider value={value}>{children}</SplitPanelContext.Provider>;
}

export const useSplitPanelState = () => useContext(SplitPanelContext).panel;

/**
 * Lets a page show the console's bottom split panel (for example "Select a health check").
 * `key` identifies the content: the panel is only republished when it changes, which avoids a render loop.
 */
export function usePageSplitPanel(spec: SplitPanelSpec | null, key: string) {
  const { setPanel } = useContext(SplitPanelContext);
  const latest = useRef(spec);
  useEffect(() => {
    latest.current = spec;
  });
  useEffect(() => {
    setPanel(latest.current);
  }, [key, setPanel]);
  useEffect(() => () => setPanel(null), [setPanel]);
}

"use client";

import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type FlashType = "success" | "error" | "warning" | "info";

interface FlashContextValue {
  items: FlashbarProps.MessageDefinition[];
  notify: (type: FlashType, content: React.ReactNode, header?: string) => void;
}

const FlashContext = createContext<FlashContextValue>({ items: [], notify: () => {} });

let counter = 0;

/** App-wide Flashbar state, like the dismissible banners at the top of the Route 53 console. */
export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);

  const dismiss = useCallback((id: string) => setItems((list) => list.filter((i) => i.id !== id)), []);

  const notify = useCallback(
    (type: FlashType, content: React.ReactNode, header?: string) => {
      const id = `flash-${++counter}`;
      const item: FlashbarProps.MessageDefinition = {
        id,
        type,
        header,
        content,
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => dismiss(id),
      };
      setItems((list) => [item, ...list].slice(0, 4));
      if (type === "success") setTimeout(() => dismiss(id), 10000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ items, notify }), [items, notify]);
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export const useFlash = () => useContext(FlashContext).notify;

export function FlashMessages() {
  const { items } = useContext(FlashContext);
  return items.length ? <Flashbar items={items} stackItems /> : null;
}

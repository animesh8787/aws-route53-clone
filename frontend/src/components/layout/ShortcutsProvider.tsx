"use client";

import Box from "@cloudscape-design/components/box";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "/", action: "Focus the search / filter box" },
  { keys: "c", action: "Create (hosted zone, or record when viewing a zone)" },
  { keys: "g then d", action: "Go to Dashboard" },
  { keys: "g then h", action: "Go to Hosted zones" },
  { keys: "?", action: "Show this help" },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** Global keyboard shortcuts (bonus feature). Ignored while typing in a field. */
export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key;
      if (pendingG.current) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        if (key === "d") router.push("/dashboard");
        if (key === "h") router.push("/hosted-zones");
        return;
      }
      if (key === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
      } else if (key === "/") {
        const input = document.querySelector<HTMLInputElement>('main input[type="search"], main input[data-shortcut-search]');
        if (input) {
          event.preventDefault();
          input.focus();
        }
      } else if (key === "c") {
        const zoneMatch = pathname.match(/^\/hosted-zones\/([^/]+)$/);
        if (pathname === "/hosted-zones") router.push("/hosted-zones/create");
        else if (zoneMatch && zoneMatch[1] !== "create") router.push(`/hosted-zones/${zoneMatch[1]}/records/create`);
      } else if (key === "?") {
        setHelpOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);

  return (
    <>
      {children}
      <Modal visible={helpOpen} onDismiss={() => setHelpOpen(false)} header="Keyboard shortcuts" closeAriaLabel="Close">
        <SpaceBetween size="s">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} style={{ display: "flex", gap: 16 }}>
              <Box variant="code" display="block">
                {s.keys}
              </Box>
              <Box>{s.action}</Box>
            </div>
          ))}
        </SpaceBetween>
      </Modal>
    </>
  );
}

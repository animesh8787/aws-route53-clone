"use client";

import { useEffect, useRef } from "react";

interface Props {
  id: string;
  open: boolean;
  onToggle: (id: string | null) => void;
  /** Accessible name of the trigger button. */
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  title?: string;
  align?: "left" | "right";
  width?: number | string;
  badge?: boolean;
  /** Role of the panel: a "dialog" for rich content, "menu" when it only holds menuitems. */
  role?: "dialog" | "menu";
  children: React.ReactNode;
}

/** A top-bar button with a dark drop-down panel; closes on outside click, Escape or `onToggle(null)`. */
export function TopMenu({ id, open, onToggle, label, trigger, triggerClassName = "r53-icon-btn", title, align = "right", width = 320, badge, role = "dialog", children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) onToggle(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onToggle(null);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onToggle]);

  return (
    <div ref={root} style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={label}
        title={title ?? label}
        aria-haspopup={role === "menu" ? "menu" : "dialog"}
        aria-expanded={open}
        onClick={() => onToggle(open ? null : id)}
      >
        {trigger}
        {badge && <span className="r53-badge" aria-hidden="true" />}
      </button>
      {open && (
        <div
          className="r53-pop"
          role={role}
          aria-label={label.replace(/\s*\(.*\)$/, "")}
          style={{ top: "calc(100% + 4px)", width, [align === "right" ? "right" : "left"]: align === "right" ? -4 : -8 }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

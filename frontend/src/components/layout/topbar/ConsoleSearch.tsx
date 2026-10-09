"use client";

import Icon from "@cloudscape-design/components/icon";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { NAV_ITEMS } from "@/components/layout/nav-items";
import { ALL_SERVICES, type ServiceEntry } from "@/components/layout/services-catalog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { api } from "@/lib/api";
import type { HostedZone, Page } from "@/types/api";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";

interface Option {
  key: string;
  group: string;
  label: string;
  description: string;
  action: { kind: "navigate"; href: string } | { kind: "service"; service: ServiceEntry } | { kind: "ask"; question: string };
}

function flatLinks(items: readonly SideNavigationProps.Item[]): { text: string; href: string }[] {
  return items.flatMap((i) => (i.type === "section" ? flatLinks(i.items) : i.type === "link" && !i.external ? [{ text: i.text, href: i.href }] : []));
}

const EXTRA_PAGES = [
  { text: "Home", href: "/home" },
  { text: "Activity", href: "/activity" },
  { text: "Billing and Cost Management", href: "/billing" },
  { text: "Account", href: "/account" },
  { text: "Security credentials", href: "/security-credentials" },
  { text: "Register domain", href: "/registered-domains/register" },
  { text: "Create hosted zone", href: "/hosted-zones/create" },
];

interface Props {
  onNavigate: (href: string) => void;
  onOpenService: (service: ServiceEntry) => void;
  /** Present once the assistant is available: "Ask Amazon Q" about the typed text. */
  onAsk?: (question: string) => void;
}

/** The console search box: features of this console, AWS services and your hosted zones. Alt+S focuses it. */
export function ConsoleSearch({ onNavigate, onOpenService, onAsk }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLowerCase();
  const debounced = useDebouncedValue(needle, 250);

  const zones = useQuery({
    queryKey: ["search", "zones", debounced],
    queryFn: () => api.get<Page<HostedZone>>("/hosted-zones", { q: debounced, page_size: 5 }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const options = useMemo<Option[]>(() => {
    const pages = [...flatLinks(NAV_ITEMS), ...EXTRA_PAGES].filter((p) => !needle || p.text.toLowerCase().includes(needle));
    const services = needle ? ALL_SERVICES.filter((s) => s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle)).slice(0, 6) : [];
    const list: Option[] = [
      ...pages.slice(0, needle ? 8 : 20).map((p): Option => ({ key: `p${p.href}`, group: "Features", label: p.text, description: `Route 53 > ${p.text}`, action: { kind: "navigate", href: p.href } })),
      ...services.map((s): Option => ({ key: `s${s.name}`, group: "Services", label: s.name, description: s.description, action: { kind: "service", service: s } })),
      ...(debounced.length >= 2 ? zones.data?.items ?? [] : []).map((z): Option => ({
        key: `z${z.zone_id}`, group: "Resources", label: z.name, description: `Hosted zone · ${z.type === "public" ? "Public" : "Private"} · ${z.zone_id}`, action: { kind: "navigate", href: `/hosted-zones/${z.zone_id}` },
      })),
    ];
    if (onAsk && needle) list.push({ key: "ask", group: "Amazon Q", label: `Ask Amazon Q: "${query.trim()}"`, description: "Get an answer about Route 53 and your resources", action: { kind: "ask", question: query.trim() } });
    return list;
  }, [needle, debounced, zones.data, query, onAsk]);

  const choose = (option: Option | undefined) => {
    if (!option) return;
    const { action } = option;
    if (action.kind === "navigate") onNavigate(action.href);
    else if (action.kind === "service") onOpenService(action.service);
    else onAsk?.(action.question);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      input.current?.blur();
    }
  };

  let lastGroup = "";
  return (
    <div className="r53-search" ref={root}>
      <span className="r53-search-icon">
        <Icon name="search" variant="inverted" />
      </span>
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label="Search"
        aria-expanded={open}
        aria-controls="r53-search-results"
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `r53-opt-${active}` : undefined}
        placeholder="Search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      <span className="r53-search-hint">[Alt+S]</span>
      {open && (
        <div id="r53-search-results" className="r53-search-results" role="listbox" aria-label="Search results">
          {options.length === 0 && <div className="r53-search-empty">No results for &quot;{query.trim()}&quot;</div>}
          {options.map((o, i) => {
            const heading = o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={o.key} role="presentation">
                {heading && <div className="r53-search-group" role="presentation">{heading}</div>}
                <button
                  id={`r53-opt-${i}`}
                  type="button"
                  role="option"
                  className="r53-search-item"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  {o.label}
                  <small>{o.description}</small>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

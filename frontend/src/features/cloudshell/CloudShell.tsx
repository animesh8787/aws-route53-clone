"use client";

import Icon from "@cloudscape-design/components/icon";
import { useEffect, useRef, useState } from "react";

import { runCommand } from "@/features/cloudshell/commands";
import type { User } from "@/types/api";

interface Line {
  id: number;
  kind: "in" | "out" | "err";
  text: string;
}

const PROMPT = "[cloudshell-user@ip-10-0-12-34 ~]$";
const WELCOME = "Welcome to AWS CloudShell (simulated, read-only).\nType \"help\" to see the supported commands, for example: aws route53 list-hosted-zones\n";

/** Bottom panel with a simulated, read-only shell that answers from the console's own data. */
export function CloudShell({ user, onClose }: { user: User; onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([{ id: 0, kind: "out", text: WELCOME }]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [actionsOpen, setActionsOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [lines, busy]);

  const push = (kind: Line["kind"], text: string) => setLines((current) => [...current, { id: nextId.current++, kind, text }]);

  const submit = async () => {
    const command = value;
    setValue("");
    setCursor(-1);
    push("in", command);
    if (command.trim()) setHistory((h) => [command, ...h.filter((c) => c !== command)].slice(0, 50));
    setBusy(true);
    const result = await runCommand(command, user);
    setBusy(false);
    if (result.clear) setLines([]);
    else if (result.text) push(result.error ? "err" : "out", result.text);
    input.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !busy) {
      event.preventDefault();
      void submit();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(cursor + 1, history.length - 1);
      if (next >= 0) {
        setCursor(next);
        setValue(history[next]);
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = cursor - 1;
      setCursor(Math.max(next, -1));
      setValue(next >= 0 ? history[next] : "");
    } else if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      setLines([]);
    }
  };

  const download = () => {
    const text = lines.map((l) => (l.kind === "in" ? `${PROMPT} ${l.text}` : l.text)).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloudshell-transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="r53-shell" aria-label="CloudShell">
      <div className="r53-shell-head">
        <h2>
          <Icon name="command-prompt" variant="inverted" />
          CloudShell
          <span className="r53-shell-tab">us-east-1</span>
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
          <button type="button" className="r53-icon-btn" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => setActionsOpen((o) => !o)}>
            Actions <Icon name="caret-down-filled" variant="inverted" />
          </button>
          {actionsOpen && (
            <ul className="r53-pop r53-menu" role="menu" aria-label="CloudShell actions" style={{ top: "auto", bottom: 36, right: 40, width: 220, borderRadius: 8 }}>
              <li role="none">
                <button type="button" role="menuitem" className="r53-menu-item" onClick={() => { setLines([]); setActionsOpen(false); input.current?.focus(); }}>
                  Clear screen
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" className="r53-menu-item" onClick={() => { download(); setActionsOpen(false); }}>
                  Download transcript
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" className="r53-menu-item" onClick={() => { setLines([{ id: nextId.current++, kind: "out", text: WELCOME }]); setHistory([]); setActionsOpen(false); }}>
                  Restart session
                </button>
              </li>
            </ul>
          )}
          <button type="button" className="r53-icon-btn" aria-label="Close CloudShell" onClick={onClose}>
            <Icon name="close" variant="inverted" />
          </button>
        </div>
      </div>
      <div ref={body} className="r53-shell-body" onClick={() => window.getSelection()?.isCollapsed && input.current?.focus()} role="log" aria-live="polite">
        {lines.map((l) =>
          l.kind === "in" ? (
            <div key={l.id} className="r53-shell-line">
              <span className="r53-shell-prompt">{PROMPT}</span>
              <span>{l.text}</span>
            </div>
          ) : (
            <div key={l.id} className={l.kind === "err" ? "r53-shell-err" : undefined}>
              {l.text}
            </div>
          ),
        )}
        <div className="r53-shell-line">
          <span className="r53-shell-prompt">{PROMPT}</span>
          <input
            ref={input}
            className="r53-shell-input"
            aria-label="CloudShell command"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
    </section>
  );
}

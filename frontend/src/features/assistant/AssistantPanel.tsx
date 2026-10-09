"use client";

import Avatar from "@cloudscape-design/chat-components/avatar";
import ChatBubble from "@cloudscape-design/chat-components/chat-bubble";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonGroup from "@cloudscape-design/components/button-group";
import PromptInput from "@cloudscape-design/components/prompt-input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { usePathname } from "next/navigation";
import { useContext, useEffect, useRef, useState } from "react";

import { ChromeContext } from "@/components/layout/ChromeContext";
import { FeedbackModal } from "@/components/layout/ConsoleFooter";
import { QLogo } from "@/components/layout/topbar/icons";
import { useAssistant } from "@/features/assistant/AssistantContext";
import { useAssistantStatus, useChat, useClearHistory, useConversations, useFeedback, type ChatMessage } from "@/features/assistant/hooks";
import { Markdown } from "@/features/assistant/Markdown";
import { timeAgo } from "@/features/activity/hooks";

const MAX_CHARS = 10_000;

const SUGGESTIONS: { title: string; text: string; tag: "Table" | "Q&A"; prompt: string }[] = [
  { title: "List my hosted zones", text: "See every hosted zone with its type and record count.", tag: "Table", prompt: "List my hosted zones in a table." },
  { title: "Find records without health checks", text: "Routing records that fail over or balance traffic but have no health check.", tag: "Table", prompt: "Which of my records use a routing policy but have no health check?" },
  { title: "Show my estimated monthly cost", text: "Break down what this account would cost per month.", tag: "Q&A", prompt: "What is my estimated monthly Route 53 cost and what drives it?" },
  { title: "Explain weighted vs latency routing", text: "When to use each routing policy, with examples.", tag: "Q&A", prompt: "Explain the difference between weighted and latency routing in Route 53, with an example of when to use each." },
  { title: "Troubleshoot a DNS answer", text: "Trace how www.example.com is answered from your records.", tag: "Q&A", prompt: "Why does www.example.com resolve the way it does? Trace the answer from my records." },
];

const LIBRARY: { group: string; prompts: string[] }[] = [
  { group: "Explore your resources", prompts: ["Summarise my Route 53 account.", "List the records in example.com.", "Which health checks are unhealthy and which records use them?", "List my registered domains and when they expire."] },
  { group: "Troubleshoot", prompts: ["How is api.example.com answered for a client in eu-west-1?", "Is any of my DNS Firewall rule groups blocking queries from production-vpc?", "Why might a CNAME at the zone apex be rejected?"] },
  { group: "Learn and build", prompts: ["Write an AWS CLI command that creates a weighted A record.", "Show a CloudFormation template for a hosted zone with an alias to CloudFront.", "What are the Route 53 service quotas I should know about?"] },
];

type View = "chat" | "history" | "library" | "settings";

function usePageContext() {
  const pathname = usePathname();
  const { chrome } = useContext(ChromeContext);
  const assistant = useAssistant();
  const crumbs = chrome.breadcrumbs.map((c) => c.text);
  return { path: pathname, title: crumbs[crumbs.length - 1] ?? "Route 53", breadcrumbs: ["Route 53", ...crumbs], selected: "", errors: assistant?.pageErrors ?? [] };
}

function MessageActions({ message, onFeedback }: { message: ChatMessage; onFeedback: (rating: "up" | "down" | null) => void }) {
  if (typeof message.id !== "number" || message.streaming || message.error) return null;
  return (
    <ButtonGroup
      variant="icon"
      ariaLabel="Message actions"
      onItemClick={({ detail }) => {
        if (detail.id === "copy") void navigator.clipboard?.writeText(message.content).catch(() => undefined);
        if (detail.id === "up") onFeedback(message.feedback === "up" ? null : "up");
        if (detail.id === "down") onFeedback(message.feedback === "down" ? null : "down");
      }}
      items={[
        { type: "icon-button", id: "up", iconName: message.feedback === "up" ? "thumbs-up-filled" : "thumbs-up", text: "Helpful" },
        { type: "icon-button", id: "down", iconName: message.feedback === "down" ? "thumbs-down-filled" : "thumbs-down", text: "Not helpful" },
        { type: "icon-button", id: "copy", iconName: "copy", text: "Copy", popoverFeedback: <StatusIndicator type="success">Copied</StatusIndicator> },
      ]}
    />
  );
}

function Messages({ messages, onFeedback, onRetry }: { messages: ChatMessage[]; onFeedback: (id: number, rating: "up" | "down" | null) => void; onRetry: (text: string) => void }) {
  const end = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, last?.content, last?.status]);

  return (
    <div className="q-messages" role="log" aria-live="polite" aria-label="Amazon Q conversation">
      {messages.map((m, index) =>
        m.role === "user" ? (
          <ChatBubble key={m.id} type="outgoing" ariaLabel="You" avatar={<Avatar ariaLabel="You" iconName="user-profile" />} hideAvatar>
            <div className="q-user-text">{m.content}</div>
          </ChatBubble>
        ) : (
          <ChatBubble
            key={m.id}
            type="incoming"
            ariaLabel="Amazon Q"
            avatar={<Avatar ariaLabel="Amazon Q" color="gen-ai" iconName="gen-ai" loading={m.streaming && !m.content} />}
            showLoadingBar={m.streaming}
            actions={<MessageActions message={m} onFeedback={(rating) => typeof m.id === "number" && onFeedback(m.id, rating)} />}
          >
            {m.content ? <Markdown text={m.content} /> : null}
            {m.status && (
              <Box color="text-status-inactive" fontSize="body-s">
                {m.status}...
              </Box>
            )}
            {m.error && (
              <SpaceBetween size="xs">
                <StatusIndicator type="error">{m.error}</StatusIndicator>
                {index > 0 && messages[index - 1].role === "user" && (
                  <Button variant="inline-link" iconName="refresh" onClick={() => onRetry(messages[index - 1].content)}>
                    Retry
                  </Button>
                )}
              </SpaceBetween>
            )}
          </ChatBubble>
        ),
      )}
      <div ref={end} />
    </div>
  );
}

function Welcome({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="q-welcome">
      <QLogo size={48} tile={false} />
      <h2>How can I help you today?</h2>
      <div className="q-cards">
        {SUGGESTIONS.map((s) => (
          <button key={s.title} type="button" className="q-card" onClick={() => onPick(s.prompt)}>
            <strong>{s.title}</strong>
            <span>{s.text}</span>
            <span className={`q-tag q-tag-${s.tag === "Table" ? "table" : "qa"}`}>{s.tag}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The Amazon Q side panel: chat with the console assistant about Route 53 and the account's resources. */
export function AssistantPanel({ width, onResize, expanded, onToggleExpand }: { width: number; onResize: (width: number) => void; expanded: boolean; onToggleExpand: () => void }) {
  const assistant = useAssistant();
  const page = usePageContext();
  const status = useAssistantStatus(true);
  const conversations = useConversations(true);
  const chat = useChat();
  const feedback = useFeedback();
  const clear = useClearHistory();
  const [view, setView] = useState<View>("chat");
  const [input, setInput] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  });

  const submit = (text: string) => {
    if (!text.trim() || chat.busy) return;
    setView("chat");
    setInput("");
    void chat.send(text.slice(0, MAX_CHARS), pageRef.current);
  };

  // Questions sent from elsewhere ("Ask Amazon Q" in search, "Diagnose with Amazon Q" on errors)
  const latest = useRef({ busy: chat.busy, send: chat.send });
  useEffect(() => {
    latest.current = { busy: chat.busy, send: chat.send };
  });
  const register = assistant?.registerHandler;
  useEffect(() => {
    if (!register) return;
    return register((text, sendNow) => {
      setView("chat");
      if (sendNow && !latest.current.busy) void latest.current.send(text.slice(0, MAX_CHARS), pageRef.current);
      else setInput(text.slice(0, MAX_CHARS));
    });
  }, [register]);

  const offline = status.data && !status.data.configured;
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (e: PointerEvent) => onResize(Math.min(Math.max(startWidth + e.clientX - startX, 300), Math.min(900, window.innerWidth - 320)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const headerButton = (label: string, icon: React.ComponentProps<typeof Button>["iconName"], onClick: () => void, pressed = false) => (
    <Button variant="icon" iconName={icon} ariaLabel={label} onClick={onClick} {...(pressed ? { ariaExpanded: true } : {})} />
  );

  return (
    <aside className="q-panel" style={{ width: expanded ? "100%" : width }} aria-label="Amazon Q">
      <div className="q-head">
        <h2>Amazon Q</h2>
        <div className="q-head-actions">
          {headerButton("New chat", "add-plus", () => {
            chat.reset();
            setView("chat");
          })}
          {headerButton("Prompt library", "file-open", () => setView(view === "library" ? "chat" : "library"), view === "library")}
          {headerButton("Chat history", "history", () => setView(view === "history" ? "chat" : "history"), view === "history")}
          {headerButton("Amazon Q settings", "settings", () => setView(view === "settings" ? "chat" : "settings"), view === "settings")}
          <span className="q-sep" aria-hidden="true" />
          {headerButton(expanded ? "Exit full screen" : "Full screen", expanded ? "exit-full-screen" : "full-screen", onToggleExpand)}
          {headerButton("Close Amazon Q", "angle-left", () => assistant?.setOpen(false))}
        </div>
      </div>

      <div className="q-body">
        {view === "history" && (
          <div className="q-list">
            <Box variant="h3">Chat history</Box>
            {(conversations.data ?? []).length === 0 && <Box color="text-body-secondary">No conversations yet.</Box>}
            {(conversations.data ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                className="q-list-item"
                onClick={() => {
                  void chat.load(c.id).then(() => setView("chat"));
                }}
              >
                <span>{c.title}</span>
                <small>{timeAgo(c.updated_at)}</small>
              </button>
            ))}
          </div>
        )}
        {view === "library" && (
          <div className="q-list">
            <Box variant="h3">Prompt library</Box>
            {LIBRARY.map((g) => (
              <div key={g.group}>
                <Box variant="awsui-key-label">{g.group}</Box>
                {g.prompts.map((p) => (
                  <button key={p} type="button" className="q-list-item" onClick={() => submit(p)}>
                    <span>{p}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        {view === "settings" && (
          <div className="q-list">
            <Box variant="h3">Amazon Q settings</Box>
            <SpaceBetween size="s">
              <div>
                <Box variant="awsui-key-label">Mode</Box>
                <div>{status.data?.mode === "groq" ? `Language model: ${status.data.model}` : status.data?.mode === "demo" ? "Demo mode (answers from your data without a language model)" : "Not configured"}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">Usage today</Box>
                <div>
                  {status.data?.used_today ?? 0} of {status.data?.daily_limit ?? 0} questions
                </div>
              </div>
              <Box color="text-body-secondary" fontSize="body-s">
                Amazon Q reads your Route 53 resources to answer questions but never changes them. Questions and the data needed to answer them are sent to the configured
                language-model provider.
              </Box>
              <Button
                onClick={() =>
                  clear.mutate(undefined, {
                    onSuccess: () => {
                      chat.reset();
                      setView("chat");
                    },
                  })
                }
                loading={clear.isPending}
              >
                Clear chat history
              </Button>
            </SpaceBetween>
          </div>
        )}
        {view === "chat" &&
          (chat.messages.length === 0 ? (
            <Welcome onPick={submit} />
          ) : (
            <Messages
              messages={chat.messages}
              onRetry={submit}
              onFeedback={(id, rating) => {
                chat.setFeedback(id, rating);
                feedback.mutate({ id, rating });
              }}
            />
          ))}
      </div>

      <div className="q-input">
        {offline && (
          <Alert type="info" header="Amazon Q is not configured">
            This deployment has no language-model key. The administrator can enable Amazon Q by setting GROQ_API_KEY on the backend.
          </Alert>
        )}
        <PromptInput
          value={input}
          onChange={({ detail }) => setInput(detail.value.slice(0, MAX_CHARS))}
          onAction={() => submit(input)}
          placeholder="Describe what you want to do with AWS, such as 'List all my hosted zones'."
          actionButtonIconName={chat.busy ? "stop-circle" : "send"}
          actionButtonAriaLabel={chat.busy ? "Stop generating" : "Send"}
          customPrimaryAction={chat.busy ? <Button variant="icon" iconName="stop-circle" ariaLabel="Stop generating" onClick={chat.stop} /> : undefined}
          disableActionButton={!input.trim() || !!offline}
          minRows={3}
          maxRows={10}
          ariaLabel="Ask Amazon Q"
        />
        <Box fontSize="body-s" color="text-body-secondary">
          {input.length > MAX_CHARS - 500 ? `${(MAX_CHARS - input.length).toLocaleString()} characters left` : "Max 10000 characters"}
        </Box>
      </div>
      <div className="q-foot">
        Help us improve Amazon Q by{" "}
        <button type="button" className="q-link" onClick={() => setFeedbackOpen(true)}>
          providing feedback
        </button>
        .
      </div>
      {!expanded && <div className="q-resize" role="separator" aria-orientation="vertical" aria-label="Resize Amazon Q panel" onPointerDown={startResize} />}
      <FeedbackModal visible={feedbackOpen} onDismiss={() => setFeedbackOpen(false)} />
    </aside>
  );
}

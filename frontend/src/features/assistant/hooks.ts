"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { ApiError, api, streamPost } from "@/lib/api";

export interface AssistantStatus {
  mode: "groq" | "demo" | "off";
  configured: boolean;
  model: string | null;
  daily_limit: number;
  used_today: number;
  max_input_chars: number;
}

export interface ChatMessage {
  /** Server id for saved assistant messages (feedback), a local key otherwise. */
  id: number | string;
  role: "user" | "assistant";
  content: string;
  feedback?: "up" | "down" | null;
  status?: string;
  error?: string;
  streaming?: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface PageContext {
  path: string;
  title: string;
  breadcrumbs: string[];
  selected: string;
  errors: string[];
}

export function useAssistantStatus(enabled: boolean) {
  return useQuery({ queryKey: ["assistant", "status"], queryFn: () => api.get<AssistantStatus>("/assistant/status"), enabled, staleTime: 30_000 });
}

export function useConversations(enabled: boolean) {
  return useQuery({ queryKey: ["assistant", "conversations"], queryFn: () => api.get<ConversationSummary[]>("/assistant/conversations"), enabled });
}

export function useFeedback() {
  return useMutation({ mutationFn: ({ id, rating }: { id: number; rating: "up" | "down" | null }) => api.post(`/assistant/messages/${id}/feedback`, { rating }) });
}

export function useClearHistory() {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => api.delete("/assistant/conversations"), onSuccess: () => client.invalidateQueries({ queryKey: ["assistant"] }) });
}

let localId = 0;
const nextLocalId = () => `local-${++localId}`;

/** One chat session: messages, streaming state and the server conversation id. */
export function useChat() {
  const client = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const patchLast = (patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
    setMessages((list) => {
      const last = list[list.length - 1];
      if (!last || last.role !== "assistant") return list;
      return [...list.slice(0, -1), { ...last, ...(typeof patch === "function" ? patch(last) : patch) }];
    });

  const send = useCallback(
    async (text: string, page: PageContext) => {
      const question = text.trim();
      if (!question || busy) return;
      setBusy(true);
      setMessages((list) => [...list, { id: nextLocalId(), role: "user", content: question }, { id: nextLocalId(), role: "assistant", content: "", streaming: true, status: "Thinking" }]);
      const controller = new AbortController();
      abort.current = controller;
      try {
        await streamPost(
          "/assistant/chat",
          { message: question, conversation_id: conversationId, page },
          ({ event, data }) => {
            if (event === "start") setConversationId(String(data.conversation_id));
            else if (event === "status") patchLast({ status: String(data.text) });
            else if (event === "delta") patchLast((m) => ({ content: m.content + String(data.text), status: undefined }));
            else if (event === "error") patchLast({ error: String(data.message), streaming: false, status: undefined });
            else if (event === "done") patchLast({ id: Number(data.message_id), streaming: false, status: undefined });
          },
          controller.signal,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") patchLast((m) => ({ streaming: false, status: undefined, content: m.content || "_Stopped._" }));
        else patchLast({ streaming: false, status: undefined, error: error instanceof ApiError ? error.detail : "Amazon Q could not be reached." });
      } finally {
        patchLast((m) => (m.streaming ? { streaming: false, status: undefined } : {}));
        setBusy(false);
        abort.current = null;
        void client.invalidateQueries({ queryKey: ["assistant"] });
      }
    },
    [busy, conversationId, client],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    setMessages([]);
    setConversationId(null);
  }, []);

  const load = useCallback(async (id: string) => {
    abort.current?.abort();
    const data = await api.get<{ id: string; messages: { id: number; role: "user" | "assistant"; content: string; feedback: "up" | "down" | null }[] }>(`/assistant/conversations/${id}`);
    setConversationId(data.id);
    setMessages(data.messages.map((m) => ({ id: m.role === "assistant" ? m.id : nextLocalId(), role: m.role, content: m.content, feedback: m.feedback })));
  }, []);

  const setFeedback = useCallback((id: number, feedback: "up" | "down" | null) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, feedback } : m))), []);

  return { messages, conversationId, busy, send, stop, reset, load, setFeedback };
}

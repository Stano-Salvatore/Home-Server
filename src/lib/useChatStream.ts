"use client";

import { useCallback, useRef, useState } from "react";
import { friendlyError } from "@/lib/friendlyError";
import { readSSE } from "@/lib/sse";

// Fired after any stream completes (send or regenerate) so sibling
// components — namely the sidebar conversation list, which lives outside
// this hook's tree — can refresh title/recency without needing a pathname
// change. Same cross-component-signal pattern as useSidebarCollapsed.ts.
export const CONVERSATIONS_CHANGED_EVENT = "nedory-conversations-changed";

export type ChatUIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { documentId: string; title: string; sourcePath: string; snippet: string }[];
  durationMs?: number;
  tokenCount?: number;
  // Transient retrieval/generation phase hint ("searching your notes…") shown
  // while the reply is still empty; cleared as soon as real text streams in.
  // Never persisted — history loads leave it unset.
  status?: string;
  createdAt?: number; // epoch ms, for the card header timestamp
  // Where the reply was actually generated, when it differs from the
  // conversation's configured target (a fallback answered). Persisted.
  via?: {
    backend: string;
    modelId: string;
    nodeName?: string;
    fallbackFrom?: { backend: string; modelId: string; nodeName?: string };
  };
};

export function useChatStream(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/conversations/${id}`);
    const data = await res.json();
    setMessages(
      (data.messages ?? [])
        .filter((m: { role: string }) => m.role !== "system")
        .map(
          (m: {
            id: string;
            role: string;
            content: string;
            citationsJson: string | null;
            viaJson: string | null;
            durationMs: number | null;
            tokenCount: number | null;
            createdAt: number | null;
          }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: m.citationsJson ? JSON.parse(m.citationsJson) : undefined,
            via: m.viaJson ? JSON.parse(m.viaJson) : undefined,
            durationMs: m.durationMs ?? undefined,
            tokenCount: m.tokenCount ?? undefined,
            // DB stores unix seconds (drizzle unixepoch default)
            createdAt: m.createdAt ? m.createdAt * 1000 : undefined,
          }),
        ),
    );
  }, []);

  // Reads an SSE stream from `url`, appending deltas to the last (assistant)
  // message. Shared by first sends and regeneration.
  const runStream = useCallback(async (url: string, body?: unknown) => {
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      for await (const data of readSSE(res) as AsyncGenerator<{
        error?: string;
        delta?: string;
        status?: string;
        citations?: ChatUIMessage["citations"];
        stats?: { durationMs: number; tokenCount: number };
        via?: ChatUIMessage["via"];
      }>) {
        if (data.error) {
          setError(friendlyError(data.error));
        } else if (data.delta) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: next[next.length - 1].content + data.delta,
              status: undefined,
            };
            return next;
          });
        } else if (data.status) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], status: data.status };
            return next;
          });
        } else if (data.citations) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], citations: data.citations };
            return next;
          });
        } else if (data.via) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], via: data.via };
            return next;
          });
        } else if (data.stats) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              durationMs: data.stats!.durationMs,
              tokenCount: data.stats!.tokenCount,
            };
            return next;
          });
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(friendlyError(err.message));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      window.dispatchEvent(new Event(CONVERSATIONS_CHANGED_EVENT));
    }
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (!conversationId) return;
      setError(null);
      setMessages((prev) => [
        ...prev,
        { id: `local-user-${Date.now()}`, role: "user", content, createdAt: Date.now() },
        { id: `local-assistant-${Date.now()}`, role: "assistant", content: "", createdAt: Date.now() },
      ]);
      await runStream(`/api/chat/conversations/${conversationId}/messages`, { content });
    },
    [conversationId, runStream],
  );

  // Re-answer the last user message: drop the previous assistant reply locally,
  // add a fresh empty one, and stream into it.
  const regenerate = useCallback(async () => {
    if (!conversationId) return;
    setError(null);
    setMessages((prev) => {
      const next = [...prev];
      if (next.length && next[next.length - 1].role === "assistant") next.pop();
      next.push({ id: `local-assistant-${Date.now()}`, role: "assistant", content: "", createdAt: Date.now() });
      return next;
    });
    await runStream(`/api/chat/conversations/${conversationId}/regenerate`);
  }, [conversationId, runStream]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, setMessages, streaming, error, send, regenerate, stop, loadHistory };
}

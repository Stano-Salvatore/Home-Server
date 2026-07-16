"use client";

import { useCallback, useRef, useState } from "react";
import { friendlyError } from "@/lib/friendlyError";

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
            durationMs: number | null;
            tokenCount: number | null;
          }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: m.citationsJson ? JSON.parse(m.citationsJson) : undefined,
            durationMs: m.durationMs ?? undefined,
            tokenCount: m.tokenCount ?? undefined,
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
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.replace(/^data:\s*/, "").trim();
          if (!line) continue;
          const data = JSON.parse(line);
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
          } else if (data.stats) {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                ...next[next.length - 1],
                durationMs: data.stats.durationMs,
                tokenCount: data.stats.tokenCount,
              };
              return next;
            });
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(friendlyError(err.message));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (!conversationId) return;
      setError(null);
      setMessages((prev) => [
        ...prev,
        { id: `local-user-${Date.now()}`, role: "user", content },
        { id: `local-assistant-${Date.now()}`, role: "assistant", content: "" },
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
      next.push({ id: `local-assistant-${Date.now()}`, role: "assistant", content: "" });
      return next;
    });
    await runStream(`/api/chat/conversations/${conversationId}/regenerate`);
  }, [conversationId, runStream]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, setMessages, streaming, error, send, regenerate, stop, loadHistory };
}

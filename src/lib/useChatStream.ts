"use client";

import { useCallback, useRef, useState } from "react";

export type ChatUIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { documentId: string; title: string; sourcePath: string; snippet: string }[];
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
        .map((m: { id: string; role: string; content: string; citationsJson: string | null }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          citations: m.citationsJson ? JSON.parse(m.citationsJson) : undefined,
        })),
    );
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
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
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
              setError(data.error);
            } else if (data.delta) {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  content: next[next.length - 1].content + data.delta,
                };
                return next;
              });
            } else if (data.citations) {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { ...next[next.length - 1], citations: data.citations };
                return next;
              });
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [conversationId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, setMessages, streaming, error, send, stop, loadHistory };
}

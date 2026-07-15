import type { ChatMessage, ChatStreamChunk, ModelBackend, RunningModel } from "./types";

// litert-lm serve is started manually (tmux) and does not report health or
// usage stats the way llama.cpp does — see LiteRT-LM issue #1929 (serve has
// no --backend flag, so this is CPU-only until Google ships it upstream).
const LITERTLM_BASE_URL = "http://127.0.0.1:9379";
const LITERTLM_MODEL_ID = "gemma4-e2b";

async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  const res = await fetch(`${LITERTLM_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: LITERTLM_MODEL_ID, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`litert-lm chat failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      const parsed = JSON.parse(payload);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield { text: delta as string };
      // no usage block from litert-lm serve — service.ts's
      // estimateTokenCount() fallback covers the reply-timer stats
    }
  }
}

export const litertLmBackend: ModelBackend = {
  kind: "litertlm",
  async listRunning(): Promise<RunningModel[]> {
    try {
      const res = await fetch(`${LITERTLM_BASE_URL}/v1/models`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data ?? []).map((m: { id: string }) => ({
        id: m.id,
        backend: "litertlm" as const,
        label: m.id,
        port: 9379,
      }));
    } catch {
      return [];
    }
  },
  chatStream(_target, messages, signal) {
    return streamChat(messages, signal);
  },
  async chatComplete(_target, messages) {
    let full = "";
    for await (const chunk of streamChat(messages)) full += chunk.text;
    return full;
  },
};

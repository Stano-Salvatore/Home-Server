import { loadSettings } from "@/server/settings/config";
import type { ChatMessage, ChatStreamChunk, ModelBackend, RunningModel } from "./types";

// litert-lm serve is started manually (tmux) and does not report health or
// usage stats the way llama.cpp does — see LiteRT-LM issue #1929 (serve has
// no --backend flag, so this is CPU-only until Google ships it upstream).
// Settings-backed (not hardcoded constants) so the base URL/default model can
// be changed without a redeploy — same pattern every other backend/provider
// URL in this app follows (ollamaHost, kiwixUrl, searxngUrl, ...). Other
// litert-lm callers (Brain planner, tool planner, autotitle) import these too
// rather than duplicating the lookup.
export function litertlmBaseUrl(): string {
  return loadSettings().litertlmBaseUrl;
}
export function litertlmModelId(): string {
  return loadSettings().litertlmModelId;
}

// One-shot, non-streaming litert-lm call for the small structured-output use
// cases (brain/planner.ts, tools/planner.ts, chat/autotitle.ts) — every one
// of them wants the exact same shape: POST, bail on a non-ok response, pull
// choices[0].message.content, degrade to null on ANY failure (timeout,
// connection refused, non-200, non-string content) so a slow/down local
// model never blocks or breaks the chat turn that triggered it. Callers own
// parsing/validating that string themselves (JSON tool calls, a title,
// query-plan JSON — each shape is different).
export async function litertlmCall(
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; timeoutMs: number },
): Promise<string | null> {
  try {
    const res = await fetch(`${litertlmBaseUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: litertlmModelId(),
        stream: false,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: unknown = data.choices?.[0]?.message?.content;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

async function* streamChat(
  target: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  // target is whatever model id the picker resolved (normally whatever
  // litert-lm's own /v1/models reported) — only the configured default id
  // covers the (extremely common today) case of an empty/unset target.
  const model = target || litertlmModelId();
  const res = await fetch(`${litertlmBaseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
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
      const baseUrl = litertlmBaseUrl();
      const res = await fetch(`${baseUrl}/v1/models`);
      if (!res.ok) return [];
      const data = await res.json();
      // Parsed from the actual configured URL rather than hardcoded, so the
      // Cookbook/Nodes UI still shows the right port if it's ever changed.
      const port = Number(new URL(baseUrl).port) || undefined;
      return (data.data ?? []).map((m: { id: string }) => ({
        id: m.id,
        backend: "litertlm" as const,
        label: m.id,
        port,
      }));
    } catch {
      return [];
    }
  },
  chatStream(target, messages, signal) {
    return streamChat(target, messages, signal);
  },
  async chatComplete(target, messages) {
    let full = "";
    for await (const chunk of streamChat(target, messages)) full += chunk.text;
    return full;
  },
};

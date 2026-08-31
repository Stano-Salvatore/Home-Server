import { resolveHost, defaultNode, parseOllamaTarget } from "@/server/nodes/nodes";
import type { ChatMessage, ChatStreamChunk, ModelBackend, PullProgressEvent, RunningModel } from "./types";

function clean(url: string): string {
  return url.replace(/\/$/, "");
}

export type OllamaTag = { name: string; size: number; modified_at: string };

export async function listInstalledTags(host: string): Promise<OllamaTag[]> {
  try {
    const res = await fetch(`${clean(host)}/api/tags`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.models ?? [];
  } catch {
    return [];
  }
}

export async function listLoadedModels(host: string): Promise<RunningModel[]> {
  try {
    const res = await fetch(`${clean(host)}/api/ps`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []).map(
      (m: { name: string; context_length?: number }): RunningModel => ({
        id: m.name,
        backend: "ollama",
        label: m.name,
        contextLength: m.context_length,
      }),
    );
  } catch {
    return [];
  }
}

// Loaded models with their in-memory footprint (from /api/ps). This is the best
// available proxy for how much RAM a node is using right now.
export async function listLoadedSizes(host: string): Promise<{ tag: string; bytes: number }[]> {
  try {
    const res = await fetch(`${clean(host)}/api/ps`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []).map((m: { name: string; size?: number; size_vram?: number }) => ({
      tag: m.name,
      bytes: m.size ?? m.size_vram ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function isOllamaReachable(host: string): Promise<boolean> {
  try {
    const res = await fetch(`${clean(host)}/api/tags`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function* pullModel(tag: string, host: string): AsyncGenerator<PullProgressEvent> {
  const res = await fetch(`${clean(host)}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: tag, stream: true }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama pull failed: ${res.status} ${res.statusText}`);
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
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      yield {
        status: parsed.status,
        completed: parsed.completed,
        total: parsed.total,
        done: parsed.status === "success",
      };
    }
  }
}

async function* streamChat(
  target: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  // target is `nodeId::tag` (or a legacy bare tag → default node).
  const { nodeId, tag } = parseOllamaTarget(target);
  const host = resolveHost(nodeId);
  const res = await fetch(`${clean(host)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // think:false — reasoning models (qwen3+) otherwise burn minutes of
    // thinking tokens that stream as message.thinking, which this backend
    // (and the chat UI) has no channel for: the user sees "writing a reply…"
    // and nothing else. Ollama ignores the flag for non-thinking models.
    body: JSON.stringify({ model: tag, messages, stream: true, think: false }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
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
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      if (parsed.message?.content) yield { text: parsed.message.content as string };
      if (parsed.done) {
        // eval_count is Ollama's exact count of tokens it generated.
        if (typeof parsed.eval_count === "number") {
          yield { text: "", tokenCount: parsed.eval_count };
        }
        return;
      }
    }
  }
}

// A vault rescan can mean hundreds/thousands of chunks — one request per
// chunk (the old /api/embeddings, singular-prompt-only endpoint) made
// ingestion network-round-trip-bound. /api/embed takes an array and returns
// embeddings in the same order. Still batched (not all texts in one
// request): a huge single payload risks a slow/oversized request against a
// phone-class Ollama instance, so this trades a little of the win for
// staying reliable at vault-rescan scale.
const EMBED_BATCH_SIZE = 32;

export async function embed(
  texts: string[],
  model: string,
  hostOverride?: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  // Embeddings run on the configured embedding host, else the default node.
  const host = clean(hostOverride?.trim() || defaultNode().url);
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await fetch(`${host}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) throw new Error(`Ollama embeddings failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    results.push(...(data.embeddings as number[][]));
  }
  return results;
}

export const ollamaBackend: ModelBackend = {
  kind: "ollama",
  async listRunning() {
    return listLoadedModels(defaultNode().url);
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

import { resolveHost, defaultNode, parseOllamaTarget } from "@/server/nodes/nodes";
import type { ChatMessage, ModelBackend, PullProgressEvent, RunningModel } from "./types";

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
): AsyncIterable<string> {
  // target is `nodeId::tag` (or a legacy bare tag → default node).
  const { nodeId, tag } = parseOllamaTarget(target);
  const host = resolveHost(nodeId);
  const res = await fetch(`${clean(host)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: tag, messages, stream: true }),
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
      if (parsed.message?.content) yield parsed.message.content as string;
      if (parsed.done) return;
    }
  }
}

export async function embed(
  texts: string[],
  model: string,
  hostOverride?: string,
): Promise<number[][]> {
  // Embeddings run on the configured embedding host, else the default node.
  const host = clean(hostOverride?.trim() || defaultNode().url);
  const results: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${host}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!res.ok) throw new Error(`Ollama embeddings failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    results.push(data.embedding as number[]);
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
    for await (const chunk of streamChat(target, messages)) full += chunk;
    return full;
  },
};

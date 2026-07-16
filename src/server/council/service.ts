import { backendFor } from "@/server/backends/registry";
import type { ChatMessage, BackendKind } from "@/server/backends/types";
import { getMemoryContext, getWikipediaContext, getRagContext } from "@/server/chat/service";

export type CouncilAsk = {
  backend: BackendKind;
  modelId: string;
  prompt: string;
  systemPrompt?: string;
  wikiEnabled?: boolean;
  ragEnabled?: boolean;
};

/**
 * Stream a single participant's answer to a prompt. Unlike a normal chat this
 * persists nothing and keeps no history — it's a one-shot used by the Council /
 * Compare views, where several run in parallel.
 */
export async function* askOneShot(
  opts: CouncilAsk,
  signal?: AbortSignal,
): AsyncGenerator<{ delta: string }> {
  const messages: ChatMessage[] = [];
  if (opts.systemPrompt) messages.push({ role: "system", content: opts.systemPrompt });

  const memory = getMemoryContext();
  if (memory) messages.push({ role: "system", content: `Pinned facts about the user:\n\n${memory}` });

  if (opts.ragEnabled) {
    const rag = await getRagContext(opts.prompt, null);
    if (rag) {
      messages.push({
        role: "system",
        content: `Relevant context from the user's notes/library (cite as [n] when used):\n\n${rag.block}`,
      });
    }
  }

  if (opts.wikiEnabled) {
    const wiki = await getWikipediaContext(opts.prompt);
    if (wiki) {
      messages.push({
        role: "system",
        content: `Verified facts from Wikipedia — prefer these for factual claims, cite as [Wn]:\n\n${wiki.block}`,
      });
    }
  }

  messages.push({ role: "user", content: opts.prompt });

  const backend = backendFor(opts.backend);
  for await (const chunk of backend.chatStream(opts.modelId, messages, signal)) {
    if (chunk.text) yield { delta: chunk.text };
  }
}

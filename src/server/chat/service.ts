import { eq, desc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { conversations, messages } from "@/server/db/schema";
import { backendFor } from "@/server/backends/registry";
import type { ChatMessage } from "@/server/backends/types";
import { newId } from "@/server/util/hash";
import { listMemoryFacts } from "@/server/brain/memory";

const HISTORY_LIMIT = 20;

export type Citation = { documentId: string; title: string; sourcePath: string; snippet: string };

export function listConversations() {
  return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).all();
}

export function getConversation(id: string) {
  return db.select().from(conversations).where(eq(conversations.id, id)).get();
}

export function createConversation(opts: {
  backend: "ollama" | "llamacpp";
  modelId: string;
  title?: string;
  systemPrompt?: string;
  ragEnabled?: boolean;
  wikiEnabled?: boolean;
}) {
  const id = newId("conv");
  db.insert(conversations)
    .values({
      id,
      title: opts.title ?? "New Chat",
      backend: opts.backend,
      modelId: opts.modelId,
      systemPrompt: opts.systemPrompt ?? null,
      ragEnabled: opts.ragEnabled ?? false,
      wikiEnabled: opts.wikiEnabled ?? false,
    })
    .run();
  return getConversation(id)!;
}

export function updateConversation(
  id: string,
  patch: Partial<{ title: string; ragEnabled: boolean; wikiEnabled: boolean; backend: string; modelId: string }>,
) {
  db.update(conversations)
    .set({ ...patch, updatedAt: Date.now() / 1000 })
    .where(eq(conversations.id, id))
    .run();
  return getConversation(id);
}

export function deleteConversation(id: string) {
  db.delete(conversations).where(eq(conversations.id, id)).run();
}

export function listMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all();
}

function getMemoryContext(): string | null {
  const facts = listMemoryFacts();
  if (facts.length === 0) return null;
  return facts.map((f) => `- ${f.content}`).join("\n");
}

async function getRagContext(query: string): Promise<{ block: string; citations: Citation[] } | null> {
  try {
    const { searchBrain } = await import("@/server/brain/search");
    const hits = await searchBrain(query, 5);
    if (hits.length === 0) return null;
    const block = hits
      .map((h, i) => `[${i + 1}] (${h.title}) ${h.content}`)
      .join("\n\n");
    const citations: Citation[] = hits.map((h) => ({
      documentId: h.documentId,
      title: h.title,
      sourcePath: h.sourcePath,
      snippet: h.content.slice(0, 200),
    }));
    return { block, citations };
  } catch {
    return null;
  }
}

async function getWikipediaContext(
  query: string,
): Promise<{ block: string; citations: Citation[] } | null> {
  try {
    const { wikipediaSearch } = await import("@/server/wikipedia/wikipedia");
    const hits = await wikipediaSearch(query);
    if (hits.length === 0) return null;
    const block = hits
      .map((h, i) => `[W${i + 1}] (Wikipedia ${h.lang}: ${h.title}) ${h.extract}`)
      .join("\n\n");
    const citations: Citation[] = hits.map((h) => ({
      documentId: `wiki:${h.lang}:${h.title}`,
      title: `Wikipedia (${h.lang}): ${h.title}`,
      sourcePath: h.url,
      snippet: h.extract.slice(0, 200),
    }));
    return { block, citations };
  } catch {
    return null;
  }
}

export async function* sendMessage(
  conversationId: string,
  userContent: string,
  signal?: AbortSignal,
): AsyncGenerator<{ delta?: string; citations?: Citation[] }> {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  db.insert(messages)
    .values({ id: newId("msg"), conversationId, role: "user", content: userContent })
    .run();

  const history = listMessages(conversationId).slice(-HISTORY_LIMIT);
  const chatMessages: ChatMessage[] = [];
  if (conversation.systemPrompt) {
    chatMessages.push({ role: "system", content: conversation.systemPrompt });
  }

  const memoryBlock = getMemoryContext();
  if (memoryBlock) {
    chatMessages.push({
      role: "system",
      content: `Things you know about the user from past conversations:\n\n${memoryBlock}`,
    });
  }

  const citationList: Citation[] = [];
  if (conversation.ragEnabled) {
    const rag = await getRagContext(userContent);
    if (rag) {
      citationList.push(...rag.citations);
      chatMessages.push({
        role: "system",
        content: `Relevant context from the user's notes/library (cite as [n] when used):\n\n${rag.block}`,
      });
    }
  }
  if (conversation.wikiEnabled) {
    const wiki = await getWikipediaContext(userContent);
    if (wiki) {
      citationList.push(...wiki.citations);
      chatMessages.push({
        role: "system",
        content: `Verified facts from Wikipedia — prefer these over memory for factual claims, and cite as [Wn]:\n\n${wiki.block}`,
      });
    }
  }
  const citations: Citation[] | undefined = citationList.length > 0 ? citationList : undefined;

  for (const m of history) {
    chatMessages.push({ role: m.role as "user" | "assistant", content: m.content });
  }

  const backend = backendFor(conversation.backend as "ollama" | "llamacpp");
  let full = "";
  try {
    for await (const chunk of backend.chatStream(conversation.modelId, chatMessages, signal)) {
      full += chunk;
      yield { delta: chunk };
    }
  } finally {
    if (full) {
      db.insert(messages)
        .values({
          id: newId("msg"),
          conversationId,
          role: "assistant",
          content: full,
          citationsJson: citations ? JSON.stringify(citations) : null,
        })
        .run();
      db.update(conversations)
        .set({ updatedAt: Date.now() / 1000 })
        .where(eq(conversations.id, conversationId))
        .run();
    }
  }

  if (citations) yield { citations };
}

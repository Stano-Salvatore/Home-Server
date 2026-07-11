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
  projectId?: string | null;
  scopeId?: string | null;
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
      projectId: opts.projectId ?? null,
      scopeId: opts.scopeId ?? null,
      // A pinned scope implies you want retrieval on.
      ragEnabled: opts.ragEnabled ?? !!opts.scopeId,
      wikiEnabled: opts.wikiEnabled ?? false,
    })
    .run();
  return getConversation(id)!;
}

export function updateConversation(
  id: string,
  patch: Partial<{
    title: string;
    ragEnabled: boolean;
    wikiEnabled: boolean;
    backend: string;
    modelId: string;
    projectId: string | null;
    scopeId: string | null;
  }>,
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

export function getMemoryContext(): string | null {
  const facts = listMemoryFacts();
  if (facts.length === 0) return null;
  return facts.map((f) => `- ${f.content}`).join("\n");
}

export async function getRagContext(
  query: string,
  projectId: string | null,
  scopeDocIds?: string[] | null,
): Promise<{ block: string; citations: Citation[] } | null> {
  try {
    const { searchBrain } = await import("@/server/brain/search");
    const { knowledgeFilter } = await import("@/server/brain/chatMemory");
    const hits = await searchBrain(query, 5, { filter: knowledgeFilter(projectId, scopeDocIds) });
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

/** Always-on: recall relevant snippets from past conversations (project-scoped). */
async function getChatMemoryContext(
  query: string,
  conversation: { id: string; projectId: string | null },
): Promise<string | null> {
  try {
    const { recallChatMemory } = await import("@/server/brain/chatMemory");
    const hits = await recallChatMemory(query, conversation);
    if (hits.length === 0) return null;
    return hits.map((h) => `- ${h.content}`).join("\n");
  } catch {
    return null;
  }
}

export async function getWikipediaContext(
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

type Conversation = NonNullable<ReturnType<typeof getConversation>>;

/**
 * Builds context (memory + recall + RAG + Wikipedia), streams the assistant
 * reply, and persists it. Shared by first-time sends and regeneration — the
 * only difference is whether the user message was just inserted or already
 * present in history.
 */
async function* streamAssistant(
  conversation: Conversation,
  userContent: string,
  signal?: AbortSignal,
): AsyncGenerator<{ delta?: string; citations?: Citation[] }> {
  const conversationId = conversation.id;
  const history = listMessages(conversationId).slice(-HISTORY_LIMIT);
  const chatMessages: ChatMessage[] = [];
  if (conversation.systemPrompt) {
    chatMessages.push({ role: "system", content: conversation.systemPrompt });
  }

  const memoryBlock = getMemoryContext();
  if (memoryBlock) {
    chatMessages.push({
      role: "system",
      content: `Pinned facts about the user:\n\n${memoryBlock}`,
    });
  }

  // Always-on long-term memory: recall relevant snippets from past chats.
  const recall = await getChatMemoryContext(userContent, conversation);
  if (recall) {
    chatMessages.push({
      role: "system",
      content: `Relevant memory from earlier conversations (use if helpful, don't force it):\n\n${recall}`,
    });
  }

  const citationList: Citation[] = [];
  if (conversation.ragEnabled) {
    // If the conversation is pinned to a scope, resolve its member docs so RAG
    // only searches those. A scope with zero members isn't a deliberate
    // "search nothing" request — it just hasn't been populated yet — so fall
    // back to searching all of Brain instead of silently returning no hits.
    let scopeDocIds: string[] | null = null;
    if (conversation.scopeId) {
      const { getScopeMembers } = await import("@/server/brain/scopes");
      const members = getScopeMembers(conversation.scopeId);
      if (members.length > 0) scopeDocIds = members;
    }

    // Enumeration questions ("list all my notes about X", "every book by X",
    // "list everything you have") need an exhaustive match, not top-K cosine
    // similarity — the latter finds the closest few, not all of them, and
    // silently drops the rest. Route those to the catalog path instead of
    // semantic RAG. A catalog query with no specific author/topic left after
    // stripping filler words means "list literally everything", not "search
    // for nothing" — those need different queries (catalogListAll vs
    // catalogSearch), not the same null-keyword fallback.
    const { isCatalogQuery, extractCatalogKeyword, catalogSearch, catalogListAll } = await import(
      "@/server/brain/catalog"
    );
    const catalogMode = isCatalogQuery(userContent);
    const catalogKeyword = catalogMode ? extractCatalogKeyword(userContent) : null;

    if (catalogMode) {
      const catalogHits = catalogKeyword
        ? catalogSearch(catalogKeyword, conversation.projectId, scopeDocIds)
        : catalogListAll(conversation.projectId, scopeDocIds);
      if (catalogHits.length > 0) {
        citationList.push(
          ...catalogHits.map((h) => ({
            documentId: h.documentId,
            title: h.title,
            sourcePath: h.sourcePath,
            snippet: h.sourcePath,
          })),
        );
        const scope = catalogKeyword ? `matching "${catalogKeyword}"` : "in the user's entire Brain";
        chatMessages.push({
          role: "system",
          content:
            `This is the COMPLETE, exhaustive list of everything ${scope} — not a sample, all ` +
            `${catalogHits.length} of them. Enumerate every one in your answer; do not omit any, and do ` +
            `not add titles that aren't in this list:\n\n` +
            catalogHits.map((h, i) => `${i + 1}. ${h.title} (${h.sourcePath})`).join("\n"),
        });
      } else {
        const scope = catalogKeyword ? `matching "${catalogKeyword}"` : "at all";
        chatMessages.push({
          role: "system",
          content:
            `The user asked for a complete list, but nothing in their notes/library matched ${scope}. ` +
            `Say so plainly — do not invent titles, authors, or facts.`,
        });
      }
    } else {
      const rag = await getRagContext(userContent, conversation.projectId, scopeDocIds);
      if (rag) {
        citationList.push(...rag.citations);
        chatMessages.push({
          role: "system",
          content:
            "You DO have access to the user's own notes and library. The passages below were " +
            "retrieved from the user's personal Obsidian vault and book collection for THIS question. " +
            "Treat them as the user's own data that they have shared with you. Answer directly and " +
            "specifically from them, and cite as [n] when you use a passage. " +
            "NEVER reply that you are an AI who cannot access personal files, book collections, or " +
            "private information — that is false here, because the user has given you these passages.\n\n" +
            rag.block,
        });
      } else {
        // RAG was on but nothing matched. Tell the model to say so honestly rather
        // than fall back to a canned "I can't access your files" refusal.
        chatMessages.push({
          role: "system",
          content:
            "The user has RAG enabled, but no passages in their notes/library matched this question. " +
            "Say plainly that you did not find any matching notes on this topic, and offer to help " +
            "another way. Do NOT claim you are unable to access the user's personal data or files, and " +
            "do NOT invent titles, authors, or facts that were not retrieved.",
        });
      }
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

  // If this conversation was launched as a persona agent that has a context
  // bridge configured (e.g. Emergi -> a health API), pull it in live.
  const { findAgentByModelId } = await import("@/server/agents/agents");
  const agent = findAgentByModelId(conversation.modelId);
  if (agent?.contextUrl) {
    const { fetchAgentContext } = await import("@/server/agents/contextBridge");
    const agentContext = await fetchAgentContext(agent);
    if (agentContext) {
      chatMessages.push({
        role: "system",
        content:
          `Live data from ${agent.name}'s connected source, fetched just now — treat it as ` +
          `current ground truth for this reply:\n\n${agentContext}`,
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
      const assistantId = newId("msg");
      db.insert(messages)
        .values({
          id: assistantId,
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

      // Remember this exchange so future chats can recall it. Best-effort;
      // never let a memory-write failure surface to the streaming caller.
      try {
        const { rememberChatTurn } = await import("@/server/brain/chatMemory");
        await rememberChatTurn({
          conversationId,
          messageId: assistantId,
          title: conversation.title,
          projectId: conversation.projectId,
          userContent,
          assistantContent: full,
        });
      } catch (err) {
        console.error("[chat] remember turn failed:", err);
      }
    }
  }

  if (citations) yield { citations };
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

  yield* streamAssistant(conversation, userContent, signal);
}

/**
 * Re-answer the last user message: drop everything after it (the previous
 * assistant reply) and stream a fresh one. No new user message is inserted.
 */
export async function* regenerateLast(
  conversationId: string,
  signal?: AbortSignal,
): AsyncGenerator<{ delta?: string; citations?: Citation[] }> {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  const msgs = listMessages(conversationId);
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) throw new Error("Nothing to regenerate");

  for (const m of msgs.slice(lastUserIdx + 1)) {
    db.delete(messages).where(eq(messages.id, m.id)).run();
  }

  yield* streamAssistant(conversation, msgs[lastUserIdx].content, signal);
}

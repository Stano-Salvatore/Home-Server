import { eq, desc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { conversations, messages } from "@/server/db/schema";
import { backendFor } from "@/server/backends/registry";
import type { ChatMessage } from "@/server/backends/types";
import { newId } from "@/server/util/hash";
import { listMemoryFacts } from "@/server/brain/memory";

const HISTORY_LIMIT = 20;

export type Citation = { documentId: string; title: string; sourcePath: string; snippet: string };
export type GenStats = { durationMs: number; tokenCount: number };

// Fallback when the backend doesn't report an exact token count (llama.cpp
// only does when it understands stream_options.include_usage; some Ollama
// versions omit eval_count on error/cancel). ~4 chars/token is the standard
// rough estimate for English text — good enough for a felt-sense tok/s, not
// meant to be exact.
function estimateTokenCount(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

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
  webEnabled?: boolean;
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
      webEnabled: opts.webEnabled ?? false,
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
    webEnabled: boolean;
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
    const { presentChunk } = await import("@/server/brain/cleanText");
    const hits = await searchBrain(query, 5, { filter: knowledgeFilter(projectId, scopeDocIds) });
    if (hits.length === 0) return null;
    // presentChunk is display/context-only cleanup (metadata scaffolding,
    // title-heading repetition) — stored chunk text stays untouched so FTS
    // and embeddings keep matching it.
    const block = hits
      .map((h, i) => `[${i + 1}] (${h.title}) ${presentChunk(h.content, h.title)}`)
      .join("\n\n");
    const citations: Citation[] = hits.map((h) => ({
      documentId: h.documentId,
      title: h.title,
      sourcePath: h.sourcePath,
      snippet: presentChunk(h.content, h.title).slice(0, 200),
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

export async function getWebContext(
  query: string,
): Promise<{ block: string; citations: Citation[] } | null> {
  try {
    const { webSearch } = await import("@/server/search/websearch");
    const hits = await webSearch(query, 5);
    if (hits.length === 0) return null;
    const block = hits
      .map((h, i) => `[S${i + 1}] (${h.title} — ${h.url}) ${h.snippet}`)
      .join("\n\n");
    const citations: Citation[] = hits.map((h) => ({
      documentId: `web:${h.url}`,
      title: h.title,
      sourcePath: h.url,
      snippet: h.snippet.slice(0, 200),
    }));
    return { block, citations };
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
): AsyncGenerator<{ delta?: string; citations?: Citation[]; stats?: GenStats; status?: string }> {
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

  // Status yields are purely cosmetic progress hints for the UI — Brain
  // replies spend 30-60s in retrieval + CPU prefill before the first token,
  // and silence that long reads as frozen. They carry no data and losing one
  // must never affect the reply.
  yield { status: "recalling context…" };

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

    // Intent detection is planner-driven: enumeration questions ("list all my
    // notes about X") need an exhaustive catalog match, existence checks ("do
    // I have anything by X?") need a yes/no over titles, and everything else
    // is semantic RAG. The planner keeps the old enumeration regex as a
    // zero-cost fast path and otherwise asks the local litert-lm model, with
    // a hard timeout that degrades to "answer" mode — so chat never blocks or
    // breaks when the model is down.
    yield { status: "understanding your question…" };
    const { planQuery } = await import("@/server/brain/planner");
    const plan = await planQuery(userContent);
    yield { status: "searching your notes…" };

    // A planner-resolved scope narrows retrieval only when the conversation
    // has no pinned scope — a user-pinned scope always wins over the plan.
    if (!scopeDocIds && plan.scopeId) {
      const { getScopeMembers } = await import("@/server/brain/scopes");
      const planMembers = getScopeMembers(plan.scopeId);
      if (planMembers.length > 0) scopeDocIds = planMembers;
    }

    const { catalogSearch, catalogListAll } = await import("@/server/brain/catalog");

    if (plan.mode === "enumerate") {
      // A plan with no specific author/topic means "list literally
      // everything", not "search for nothing" — different queries.
      let catalogHits = plan.entity
        ? catalogSearch(plan.entity, conversation.projectId, scopeDocIds)
        : catalogListAll(conversation.projectId, scopeDocIds);
      // A scope can be a purely visual grouping whose titles/paths don't
      // contain the entity text (see bulkAssignScopeByIds) — list the
      // resolved scope's members instead of reporting nothing.
      if (catalogHits.length === 0 && plan.entity && plan.scopeId && scopeDocIds) {
        catalogHits = catalogListAll(conversation.projectId, scopeDocIds);
      }
      if (catalogHits.length > 0) {
        citationList.push(
          ...catalogHits.map((h) => ({
            documentId: h.documentId,
            title: h.title,
            sourcePath: h.sourcePath,
            snippet: h.sourcePath,
          })),
        );
        const scope = plan.entity ? `matching "${plan.entity}"` : "in the user's entire Brain";
        chatMessages.push({
          role: "system",
          content:
            `This is the COMPLETE, exhaustive list of everything ${scope} — not a sample, all ` +
            `${catalogHits.length} of them. Enumerate every one in your answer; do not omit any, and do ` +
            `not add titles that aren't in this list:\n\n` +
            catalogHits.map((h, i) => `${i + 1}. ${h.title} (${h.sourcePath})`).join("\n"),
        });
      } else {
        const scope = plan.entity ? `matching "${plan.entity}"` : "at all";
        chatMessages.push({
          role: "system",
          content:
            `The user asked for a complete list, but nothing in their notes/library matched ${scope}. ` +
            `Say so plainly — do not invent titles, authors, or facts.`,
        });
      }
    } else if (plan.mode === "exists") {
      const existsHits = plan.entity
        ? catalogSearch(plan.entity, conversation.projectId, scopeDocIds, 10)
        : catalogListAll(conversation.projectId, scopeDocIds, 10);
      if (existsHits.length > 0) {
        citationList.push(
          ...existsHits.map((h) => ({
            documentId: h.documentId,
            title: h.title,
            sourcePath: h.sourcePath,
            snippet: h.sourcePath,
          })),
        );
        chatMessages.push({
          role: "system",
          content:
            `The user asked WHETHER they have notes/books on something. These titles from their ` +
            `library matched${plan.entity ? ` "${plan.entity}"` : ""}:\n\n` +
            existsHits.map((h, i) => `${i + 1}. ${h.title} (${h.sourcePath})`).join("\n") +
            `\n\nAnswer yes/no and name what was found. Do not invent titles that aren't in this list.`,
        });
      } else {
        chatMessages.push({
          role: "system",
          content:
            `The user asked whether they have notes/books on something, but nothing in their ` +
            `notes/library matched${plan.entity ? ` "${plan.entity}"` : ""}. Say plainly that ` +
            `nothing matched — do not invent titles, authors, or facts.`,
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
  if (conversation.webEnabled) {
    yield { status: "searching the web…" };
    const web = await getWebContext(userContent);
    if (web) {
      citationList.push(...web.citations);
      chatMessages.push({
        role: "system",
        content:
          `Live web search results fetched just now for this question — treat them as more ` +
          `current than your training data, and cite as [Sn]:\n\n${web.block}`,
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

  // Distinguishes "still searching" from "found it, now generating" — on
  // litert-lm the CPU prefill after this line is the longest silent phase.
  yield { status: "writing a reply…" };

  const backend = backendFor(conversation.backend as "ollama" | "llamacpp");
  let full = "";
  let reportedTokenCount: number | undefined;
  let stats: GenStats | undefined;
  const startedAt = Date.now();
  try {
    for await (const chunk of backend.chatStream(conversation.modelId, chatMessages, signal)) {
      if (chunk.text) {
        full += chunk.text;
        yield { delta: chunk.text };
      }
      if (chunk.tokenCount !== undefined) reportedTokenCount = chunk.tokenCount;
    }
  } finally {
    if (full) {
      const durationMs = Date.now() - startedAt;
      const tokenCount = reportedTokenCount ?? estimateTokenCount(full);
      stats = { durationMs, tokenCount };
      const assistantId = newId("msg");
      db.insert(messages)
        .values({
          id: assistantId,
          conversationId,
          role: "assistant",
          content: full,
          citationsJson: citations ? JSON.stringify(citations) : null,
          durationMs,
          tokenCount,
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
  if (stats) yield { stats };
}

export async function* sendMessage(
  conversationId: string,
  userContent: string,
  signal?: AbortSignal,
): AsyncGenerator<{ delta?: string; citations?: Citation[]; stats?: GenStats; status?: string }> {
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
): AsyncGenerator<{ delta?: string; citations?: Citation[]; stats?: GenStats; status?: string }> {
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

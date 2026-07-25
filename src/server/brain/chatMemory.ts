import { sql, eq, asc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainChunks, brainDocuments } from "@/server/db/schema";
import { getSetting } from "@/server/settings/config";
import { ingestDocument, deleteDocument } from "./ingest";
import type { SearchHit } from "./search";
import type { MetaFilter } from "./vectorTypes";

// Rolling budget for chat-derived memory. Default 5 GB; overridable via a
// `chat_memory_cap_bytes` setting. When exceeded, the oldest turns are dropped.
const DEFAULT_CAP_BYTES = 5 * 1024 * 1024 * 1024;

export function chatMemoryCapBytes(): number {
  const raw = getSetting("chat_memory_cap_bytes");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAP_BYTES;
}

/** Approx bytes used by chat memory: chunk text + stored embedding blobs. */
export function chatMemoryBytes(): number {
  const row = db
    .select({
      bytes: sql<number>`coalesce(sum(length(${brainChunks.content}) + length(${brainChunks.embedding})), 0)`,
    })
    .from(brainChunks)
    .innerJoin(brainDocuments, eq(brainChunks.documentId, brainDocuments.id))
    .where(eq(brainDocuments.sourceType, "chat"))
    .get();
  return row?.bytes ?? 0;
}

export function chatMemoryStats() {
  const count = db
    .select({ n: sql<number>`count(*)` })
    .from(brainDocuments)
    .where(eq(brainDocuments.sourceType, "chat"))
    .get();
  return { bytes: chatMemoryBytes(), turns: count?.n ?? 0, capBytes: chatMemoryCapBytes() };
}

function docBytes(documentId: string): number {
  const row = db
    .select({
      bytes: sql<number>`coalesce(sum(length(${brainChunks.content}) + length(${brainChunks.embedding})), 0)`,
    })
    .from(brainChunks)
    .where(eq(brainChunks.documentId, documentId))
    .get();
  return row?.bytes ?? 0;
}

/** Drop the oldest chat-memory turns until we're back under the cap. */
export async function evictOldChatMemory() {
  const cap = chatMemoryCapBytes();
  let total = chatMemoryBytes();
  if (total <= cap) return;

  const oldest = db
    .select({ id: brainDocuments.id })
    .from(brainDocuments)
    .where(eq(brainDocuments.sourceType, "chat"))
    .orderBy(asc(brainDocuments.indexedAt))
    .all();

  for (const doc of oldest) {
    if (total <= cap) break;
    total -= docBytes(doc.id);
    await deleteDocument(doc.id);
  }
}

/**
 * Remember one exchange so agents can recall it in future chats. Best-effort:
 * embedding failures (e.g. the model isn't pulled) must never break the chat.
 */
export async function rememberChatTurn(opts: {
  conversationId: string;
  messageId: string;
  title: string;
  projectId: string | null;
  userContent: string;
  assistantContent: string;
}) {
  try {
    await ingestDocument({
      sourceType: "chat",
      sourcePath: `chat:${opts.conversationId}:${opts.messageId}`,
      title: opts.title || "Chat",
      projectId: opts.projectId,
      content: `User: ${opts.userContent}\nAssistant: ${opts.assistantContent}`,
    });
    await evictOldChatMemory();
  } catch (err) {
    console.error("[chat-memory] failed to remember turn:", err);
  }
}

/**
 * Retrieve past-conversation snippets relevant to the current message. Chat
 * memory is isolated by project (a project's chats only recall that project's
 * memory; global chats only recall global memory), and never recalls the
 * current conversation's own turns.
 */
export async function recallChatMemory(
  query: string,
  conversation: { id: string; projectId: string | null },
  topK = 4,
): Promise<SearchHit[]> {
  try {
    const { searchBrain } = await import("./search");
    const filter: MetaFilter = {
      sourceTypeEq: "chat",
      projectIdIn: [conversation.projectId],
      conversationIdNe: conversation.id,
    };
    // A modest floor keeps unrelated chatter out of the prompt. Dense-only
    // (lexical: false): the 0.55 floor is a cosine-similarity threshold, and
    // BM25 word matches on casual chat text would pull unrelated chatter in.
    return await searchBrain(query, topK, { filter, minScore: 0.55, lexical: false });
  } catch {
    return [];
  }
}

/** Filter for opt-in RAG: knowledge docs only (never chat memory), project-aware.
 *  A scope (set of document ids) further narrows retrieval to those docs. */
export function knowledgeFilter(
  projectId: string | null,
  scopeDocIds?: string[] | null,
): MetaFilter {
  // Global knowledge (projectId null) is always available; project docs only
  // inside their own project.
  const filter: MetaFilter = {
    sourceTypeNe: "chat",
    projectIdIn: projectId ? [null, projectId] : [null],
  };
  if (scopeDocIds) filter.documentIdIn = scopeDocIds;
  return filter;
}

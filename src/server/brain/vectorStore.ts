import { db } from "@/server/db/client";
import { brainChunks, brainDocuments } from "@/server/db/schema";

export type ChunkMeta = {
  projectId: string | null;
  sourceType: string;
  conversationId: string | null; // set only for chat-memory chunks
};

type IndexedChunk = ChunkMeta & {
  id: string;
  documentId: string;
  embedding: Float32Array;
};

type VectorIndexState = {
  chunks: IndexedChunk[];
  loaded: boolean;
};

declare global {
  var __homeServerVectorIndex: VectorIndexState | undefined;
}

// Next.js can bundle server route handlers and instrumentation-bootstrapped
// modules into separate module graphs, so a plain module-level variable here
// is NOT guaranteed to be a single process-wide instance (mirrors why
// db/client.ts also caches on globalThis). Without this, the ingest path and
// the search/watcher path can end up mutating two different in-memory arrays.
function state(): VectorIndexState {
  if (!globalThis.__homeServerVectorIndex) {
    globalThis.__homeServerVectorIndex = { chunks: [], loaded: false };
  }
  return globalThis.__homeServerVectorIndex;
}

export function floatsToBuffer(vec: number[]): Buffer {
  const arr = new Float32Array(vec);
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function bufferToFloats(buf: Buffer): Float32Array {
  const copy = Buffer.from(buf); // ensure 4-byte-aligned, owned backing buffer
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

// A chat-memory document's sourcePath is `chat:{conversationId}:{messageId}`.
export function conversationIdOf(sourceType: string, sourcePath: string): string | null {
  if (sourceType !== "chat") return null;
  const parts = sourcePath.split(":");
  return parts[1] ?? null;
}

export function loadVectorIndex() {
  const chunkRows = db.select().from(brainChunks).all();
  const docRows = db.select().from(brainDocuments).all();
  const metaByDoc = new Map(
    docRows.map((d) => [
      d.id,
      {
        projectId: d.projectId ?? null,
        sourceType: d.sourceType,
        conversationId: conversationIdOf(d.sourceType, d.sourcePath),
      } as ChunkMeta,
    ]),
  );
  const s = state();
  s.chunks = chunkRows.map((r) => {
    const meta = metaByDoc.get(r.documentId);
    return {
      id: r.id,
      documentId: r.documentId,
      embedding: bufferToFloats(r.embedding),
      projectId: meta?.projectId ?? null,
      sourceType: meta?.sourceType ?? "manual",
      conversationId: meta?.conversationId ?? null,
    };
  });
  s.loaded = true;
  console.log(`[brain] vector index loaded (${s.chunks.length} chunks)`);
}

function ensureLoaded() {
  if (!state().loaded) loadVectorIndex();
}

export function addToIndex(
  chunks: { id: string; documentId: string; embedding: number[] }[],
  meta: ChunkMeta,
) {
  ensureLoaded();
  const s = state();
  const existingIds = new Set(s.chunks.map((c) => c.id));
  for (const c of chunks) {
    if (existingIds.has(c.id)) continue; // ensureLoaded() may have just picked this row up from the DB
    s.chunks.push({
      id: c.id,
      documentId: c.documentId,
      embedding: new Float32Array(c.embedding),
      projectId: meta.projectId,
      sourceType: meta.sourceType,
      conversationId: meta.conversationId,
    });
  }
}

export function removeDocumentFromIndex(documentId: string) {
  ensureLoaded();
  const s = state();
  s.chunks = s.chunks.filter((c) => c.documentId !== documentId);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function searchIndex(
  queryEmbedding: number[],
  topK: number,
  filter?: (meta: ChunkMeta) => boolean,
): { id: string; documentId: string; score: number }[] {
  ensureLoaded();
  const query = new Float32Array(queryEmbedding);
  let chunks = state().chunks;
  if (filter) chunks = chunks.filter(filter);
  return chunks
    .map((c) => ({ id: c.id, documentId: c.documentId, score: cosineSimilarity(query, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function indexSize() {
  return state().chunks.length;
}

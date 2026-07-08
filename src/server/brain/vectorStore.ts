import { db } from "@/server/db/client";
import { brainChunks, brainDocuments } from "@/server/db/schema";
import { loadSettings } from "@/server/settings/config";
import { QdrantBackend } from "./qdrant";
import {
  metaMatches,
  type ChunkMeta,
  type MetaFilter,
  type IndexedPoint,
  type VectorHit,
} from "./vectorTypes";

export type { ChunkMeta, MetaFilter } from "./vectorTypes";

type MemChunk = ChunkMeta & { id: string; documentId: string; embedding: Float32Array };

type VectorIndexState = { chunks: MemChunk[]; loaded: boolean };

declare global {
  var __homeServerVectorIndex: VectorIndexState | undefined;
  var __homeServerQdrant: QdrantBackend | undefined;
}

// Next.js can bundle server route handlers and instrumentation-bootstrapped
// modules into separate module graphs, so a plain module-level variable here
// is NOT guaranteed to be a single process-wide instance (mirrors why
// db/client.ts also caches on globalThis).
function memState(): VectorIndexState {
  if (!globalThis.__homeServerVectorIndex) {
    globalThis.__homeServerVectorIndex = { chunks: [], loaded: false };
  }
  return globalThis.__homeServerVectorIndex;
}

// When a Qdrant URL is configured, vectors live there instead of in this
// process's RAM — the only thing that lets chat memory grow past what a phone
// can hold in memory. Blank keeps the fast, dependency-free in-memory index.
function qdrant(): QdrantBackend | null {
  const { qdrantUrl, qdrantCollection } = loadSettings();
  if (!qdrantUrl.trim()) return null;
  if (!globalThis.__homeServerQdrant) {
    globalThis.__homeServerQdrant = new QdrantBackend(qdrantUrl, qdrantCollection);
  }
  return globalThis.__homeServerQdrant;
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

// ---------- in-memory backend ----------

function memLoad() {
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
  const s = memState();
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
  console.log(`[brain] in-memory vector index loaded (${s.chunks.length} chunks)`);
}

function memEnsureLoaded() {
  if (!memState().loaded) memLoad();
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

// ---------- public API (async so either backend fits) ----------

export async function loadVectorIndex() {
  const q = qdrant();
  if (q) {
    await q.load();
    console.log("[brain] using Qdrant vector backend");
    return;
  }
  memLoad();
}

export async function addToIndex(points: IndexedPoint[], meta: ChunkMeta) {
  const q = qdrant();
  if (q) {
    await q.upsert(points, meta);
    return;
  }
  memEnsureLoaded();
  const s = memState();
  const existingIds = new Set(s.chunks.map((c) => c.id));
  for (const c of points) {
    if (existingIds.has(c.id)) continue;
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

export async function removeDocumentFromIndex(documentId: string) {
  const q = qdrant();
  if (q) {
    await q.removeDocument(documentId);
    return;
  }
  memEnsureLoaded();
  const s = memState();
  s.chunks = s.chunks.filter((c) => c.documentId !== documentId);
}

export async function searchIndex(
  queryEmbedding: number[],
  topK: number,
  filter?: MetaFilter,
): Promise<VectorHit[]> {
  const q = qdrant();
  if (q) {
    return q.search(queryEmbedding, topK, filter);
  }
  memEnsureLoaded();
  const query = new Float32Array(queryEmbedding);
  return memState()
    .chunks.filter((c) => metaMatches(c, filter))
    .map((c) => ({ id: c.id, documentId: c.documentId, score: cosineSimilarity(query, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function indexSize() {
  return memState().chunks.length;
}

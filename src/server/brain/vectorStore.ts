import { db } from "@/server/db/client";
import { brainChunks } from "@/server/db/schema";

type IndexedChunk = {
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

export function loadVectorIndex() {
  const rows = db.select().from(brainChunks).all();
  const s = state();
  s.chunks = rows.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    embedding: bufferToFloats(r.embedding),
  }));
  s.loaded = true;
  console.log(`[brain] vector index loaded (${s.chunks.length} chunks)`);
}

function ensureLoaded() {
  if (!state().loaded) loadVectorIndex();
}

export function addToIndex(chunks: { id: string; documentId: string; embedding: number[] }[]) {
  ensureLoaded();
  const s = state();
  const existingIds = new Set(s.chunks.map((c) => c.id));
  for (const c of chunks) {
    if (existingIds.has(c.id)) continue; // ensureLoaded() may have just picked this row up from the DB
    s.chunks.push({ id: c.id, documentId: c.documentId, embedding: new Float32Array(c.embedding) });
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

export function searchIndex(queryEmbedding: number[], topK: number): { id: string; documentId: string; score: number }[] {
  ensureLoaded();
  const query = new Float32Array(queryEmbedding);
  return state()
    .chunks.map((c) => ({ id: c.id, documentId: c.documentId, score: cosineSimilarity(query, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function indexSize() {
  return state().chunks.length;
}

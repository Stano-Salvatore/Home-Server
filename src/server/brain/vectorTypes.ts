export type ChunkMeta = {
  projectId: string | null;
  sourceType: string;
  conversationId: string | null; // set only for chat-memory chunks
};

// Declarative scope filter understood by both the in-memory and Qdrant backends
// (a plain predicate can't be translated to Qdrant's server-side filtering).
export type MetaFilter = {
  sourceTypeEq?: string;
  sourceTypeNe?: string;
  projectIdIn?: (string | null)[];
  conversationIdNe?: string;
};

export type IndexedPoint = {
  id: string;
  documentId: string;
  embedding: number[];
};

export type VectorHit = {
  id: string;
  documentId: string;
  score: number;
};

export function metaMatches(meta: ChunkMeta, f?: MetaFilter): boolean {
  if (!f) return true;
  if (f.sourceTypeEq !== undefined && meta.sourceType !== f.sourceTypeEq) return false;
  if (f.sourceTypeNe !== undefined && meta.sourceType === f.sourceTypeNe) return false;
  if (f.projectIdIn !== undefined && !f.projectIdIn.includes(meta.projectId)) return false;
  if (f.conversationIdNe !== undefined && meta.conversationId === f.conversationIdNe) return false;
  return true;
}

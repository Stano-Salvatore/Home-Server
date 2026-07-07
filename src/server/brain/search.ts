import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainChunks, brainDocuments } from "@/server/db/schema";
import { embedQuery } from "./embeddings";
import { searchIndex, type ChunkMeta } from "./vectorStore";

export type SearchHit = {
  documentId: string;
  title: string;
  sourcePath: string;
  content: string;
  score: number;
};

export async function searchBrain(
  query: string,
  topK = 5,
  opts?: { filter?: (meta: ChunkMeta) => boolean; minScore?: number },
): Promise<SearchHit[]> {
  const queryEmbedding = await embedQuery(query);
  let hits = searchIndex(queryEmbedding, topK, opts?.filter);
  if (opts?.minScore != null) hits = hits.filter((h) => h.score >= opts.minScore!);
  if (hits.length === 0) return [];

  const chunkRows = db
    .select()
    .from(brainChunks)
    .where(inArray(brainChunks.id, hits.map((h) => h.id)))
    .all();
  const chunkById = new Map(chunkRows.map((c) => [c.id, c]));

  const documentIds = [...new Set(hits.map((h) => h.documentId))];
  const documentRows = db
    .select()
    .from(brainDocuments)
    .where(inArray(brainDocuments.id, documentIds))
    .all();
  const documentById = new Map(documentRows.map((d) => [d.id, d]));

  return hits
    .map((h) => {
      const chunk = chunkById.get(h.id);
      const document = documentById.get(h.documentId);
      if (!chunk || !document) return null;
      return {
        documentId: h.documentId,
        title: document.title,
        sourcePath: document.sourcePath,
        content: chunk.content,
        score: h.score,
      };
    })
    .filter((h): h is SearchHit => h !== null);
}

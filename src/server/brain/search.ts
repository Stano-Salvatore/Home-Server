import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainChunks, brainDocuments } from "@/server/db/schema";
import { embedQuery } from "./embeddings";
import { searchIndex, conversationIdOf } from "./vectorStore";
import { searchLexical } from "./lexical";
import { metaMatches, type MetaFilter, type VectorHit } from "./vectorTypes";

export type SearchHit = {
  documentId: string;
  title: string;
  sourcePath: string;
  content: string;
  score: number;
};

// Candidates pulled from each list (dense, lexical) before fusion; the fused
// top-K is what callers actually receive.
const K_CANDIDATES = 20;
const RRF_K = 60; // standard reciprocal-rank-fusion constant

// score(d) = Σ 1/(RRF_K + rank_i(d)) across every list the chunk appears in.
// Rank-based, so the incompatible score scales (cosine vs BM25) never mix.
function reciprocalRankFusion(lists: VectorHit[][]): VectorHit[] {
  const fused = new Map<string, { hit: VectorHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, i) => {
      const entry = fused.get(hit.id) ?? { hit, score: 0 };
      entry.score += 1 / (RRF_K + i + 1);
      fused.set(hit.id, entry);
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .map((e) => ({ ...e.hit, score: e.score }));
}

// Lexical hits come straight from the FTS table with no scope awareness, so
// they get the SAME MetaFilter treatment dense hits get inside the vector
// store — same ChunkMeta shape, same metaMatches predicate.
function filterLexicalByMeta(hits: VectorHit[], filter?: MetaFilter): VectorHit[] {
  if (hits.length === 0 || !filter) return hits;
  const docIds = [...new Set(hits.map((h) => h.documentId))];
  const docRows = db.select().from(brainDocuments).where(inArray(brainDocuments.id, docIds)).all();
  const metaByDoc = new Map(
    docRows.map((d) => [
      d.id,
      {
        projectId: d.projectId ?? null,
        sourceType: d.sourceType,
        conversationId: conversationIdOf(d.sourceType, d.sourcePath),
        documentId: d.id,
      },
    ]),
  );
  return hits.filter((h) => {
    const meta = metaByDoc.get(h.documentId);
    return meta ? metaMatches(meta, filter) : false;
  });
}

export async function searchBrain(
  query: string,
  topK = 5,
  opts?: { filter?: MetaFilter; minScore?: number; lexical?: boolean },
): Promise<SearchHit[]> {
  const queryEmbedding = await embedQuery(query);

  let hits: VectorHit[];
  if (opts?.lexical === false) {
    // Dense-only path, cosine scores intact — chat-memory recall depends on
    // its minScore being a cosine floor, so it opts out of fusion entirely.
    hits = await searchIndex(queryEmbedding, topK, opts?.filter);
    if (opts?.minScore != null) hits = hits.filter((h) => h.score >= opts.minScore!);
  } else {
    let dense = await searchIndex(queryEmbedding, K_CANDIDATES, opts?.filter);
    // minScore is a cosine floor, so it applies to the dense list BEFORE
    // fusion — post-fusion scores are on the (much smaller) RRF scale.
    if (opts?.minScore != null) dense = dense.filter((h) => h.score >= opts.minScore!);
    const lexical = filterLexicalByMeta(searchLexical(query, K_CANDIDATES), opts?.filter);
    hits = reciprocalRankFusion([dense, lexical]).slice(0, topK);
  }
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

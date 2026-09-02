import { loadSettings } from "@/server/settings/config";

// Cross-encoder rerank stage (spec: bge-reranker-v2-m3 behind llama.cpp's
// /v1/rerank). Runs AFTER reciprocal-rank fusion: the fused top-N candidates
// go to the reranker with their chunk text, and only the reranker's best
// survive into the prompt. Gated on the rerankUrl setting (empty = off) and
// must never break retrieval: any failure or timeout returns null and the
// caller keeps the plain RRF order — same behavior as before this existed.

const RERANK_TIMEOUT_MS = 4000;

export type RerankCandidate = { id: string; text: string };

export function rerankConfigured(): boolean {
  return loadSettings().rerankUrl.trim() !== "";
}

/** Returns candidate ids in reranked order, or null on any failure. */
export async function rerankCandidates(
  query: string,
  candidates: RerankCandidate[],
): Promise<string[] | null> {
  const url = loadSettings().rerankUrl.trim();
  if (!url || candidates.length === 0) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "reranker",
        query,
        documents: candidates.map((c) => c.text),
      }),
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { index: number; relevance_score: number }[] };
    if (!Array.isArray(data.results) || data.results.length === 0) return null;
    return data.results
      .slice()
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => candidates[r.index]?.id)
      .filter((id): id is string => id !== undefined);
  } catch {
    return null;
  }
}

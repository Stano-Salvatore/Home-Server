// Full RAG search over the in-memory vector store is implemented in phase 4 (Brain).
export type SearchHit = { documentId: string; title: string; sourcePath: string; content: string; score: number };

export async function searchBrain(query: string, topK = 5): Promise<SearchHit[]> {
  void query;
  void topK;
  return [];
}

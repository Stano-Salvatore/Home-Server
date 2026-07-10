import type { ChunkMeta, MetaFilter, VectorHit, IndexedPoint } from "./vectorTypes";

// Minimal Qdrant REST client — no SDK, just fetch, so it stays native-free and
// works from Termux. Vectors live in Qdrant (e.g. on the Lenovo box) instead of
// this process's RAM, which is what lets chat memory grow past what a phone can
// hold in memory.

function clean(url: string) {
  return url.replace(/\/$/, "");
}

// Qdrant point ids must be uint64 or UUID. Our chunk ids are strings like
// "chunk_<uuid>", so we send the UUID part as the id and keep the original in
// the payload for round-tripping.
function pointId(chunkId: string): string {
  const uuidPart = chunkId.includes("_") ? chunkId.slice(chunkId.indexOf("_") + 1) : chunkId;
  return uuidPart;
}

// Qdrant can't match on null, so null projectId is stored as "" and the current
// conversation exclusion uses a sentinel too.
function payloadOf(meta: ChunkMeta, chunkId: string, documentId: string) {
  return {
    chunk_id: chunkId,
    document_id: documentId,
    project_id: meta.projectId ?? "",
    source_type: meta.sourceType,
    conversation_id: meta.conversationId ?? "",
  };
}

function toQdrantFilter(f?: MetaFilter) {
  if (!f) return undefined;
  const must: unknown[] = [];
  const must_not: unknown[] = [];
  if (f.sourceTypeEq !== undefined) must.push({ key: "source_type", match: { value: f.sourceTypeEq } });
  if (f.sourceTypeNe !== undefined) must_not.push({ key: "source_type", match: { value: f.sourceTypeNe } });
  if (f.projectIdIn !== undefined) {
    must.push({ key: "project_id", match: { any: f.projectIdIn.map((p) => p ?? "") } });
  }
  if (f.conversationIdNe !== undefined) {
    must_not.push({ key: "conversation_id", match: { value: f.conversationIdNe } });
  }
  if (f.documentIdIn !== undefined) {
    must.push({ key: "document_id", match: { any: f.documentIdIn } });
  }
  const filter: Record<string, unknown> = {};
  if (must.length) filter.must = must;
  if (must_not.length) filter.must_not = must_not;
  return Object.keys(filter).length ? filter : undefined;
}

export class QdrantBackend {
  private url: string;
  private collection: string;
  private ensured = false;

  constructor(url: string, collection: string) {
    this.url = clean(url);
    this.collection = collection;
  }

  private async req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Qdrant ${method} ${path} → ${res.status} ${text}`);
    }
    return res.json();
  }

  // Create the collection on first use, sizing it to the embedding model's
  // dimensionality (inferred from the first vector we see).
  private async ensure(dim: number) {
    if (this.ensured) return;
    try {
      const info = await this.req("GET", `/collections/${this.collection}`);
      if (info?.result) {
        this.ensured = true;
        return;
      }
    } catch {
      // not found — create it below
    }
    await this.req("PUT", `/collections/${this.collection}`, {
      vectors: { size: dim, distance: "Cosine" },
    });
    // Payload indexes make the scoped filters fast.
    for (const field of ["project_id", "source_type", "conversation_id", "document_id"]) {
      await this.req("PUT", `/collections/${this.collection}/index`, {
        field_name: field,
        field_schema: "keyword",
      }).catch(() => {});
    }
    this.ensured = true;
  }

  async load() {
    // Nothing to load into RAM — Qdrant is the store. Just verify reachability
    // lazily on first write/search.
  }

  async upsert(points: IndexedPoint[], meta: ChunkMeta) {
    if (points.length === 0) return;
    await this.ensure(points[0].embedding.length);
    await this.req("PUT", `/collections/${this.collection}/points`, {
      points: points.map((p) => ({
        id: pointId(p.id),
        vector: p.embedding,
        payload: payloadOf(meta, p.id, p.documentId),
      })),
    });
  }

  async removeDocument(documentId: string) {
    if (!this.ensured) {
      // If the collection was never created, there's nothing to delete.
      try {
        await this.req("GET", `/collections/${this.collection}`);
        this.ensured = true;
      } catch {
        return;
      }
    }
    await this.req("POST", `/collections/${this.collection}/points/delete`, {
      filter: { must: [{ key: "document_id", match: { value: documentId } }] },
    });
  }

  async search(embedding: number[], topK: number, filter?: MetaFilter): Promise<VectorHit[]> {
    await this.ensure(embedding.length);
    const data = await this.req("POST", `/collections/${this.collection}/points/search`, {
      vector: embedding,
      limit: topK,
      with_payload: true,
      filter: toQdrantFilter(filter),
    });
    const result = (data?.result ?? []) as {
      score: number;
      payload?: { chunk_id?: string; document_id?: string };
    }[];
    return result
      .filter((r) => r.payload?.chunk_id && r.payload?.document_id)
      .map((r) => ({
        id: r.payload!.chunk_id!,
        documentId: r.payload!.document_id!,
        score: r.score,
      }));
  }
}

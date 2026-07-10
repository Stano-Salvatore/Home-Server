import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainDocuments, brainChunks } from "@/server/db/schema";
import { embedTexts } from "./embeddings";
import { addToIndex, floatsToBuffer, conversationIdOf, resetVectorIndex } from "./vectorStore";

/**
 * Re-embeds every existing chunk with the currently configured embedding
 * model (e.g. after switching from nomic-embed-text to bge-m3) and rebuilds
 * the vector index from scratch. Reuses the chunk text already stored in
 * SQLite, so it doesn't need to re-read source files.
 */
export async function reindexAllDocuments(): Promise<{ documents: number; chunks: number }> {
  await resetVectorIndex();

  const docs = db.select().from(brainDocuments).all();
  let chunkCount = 0;

  for (const doc of docs) {
    const chunkRows = db.select().from(brainChunks).where(eq(brainChunks.documentId, doc.id)).all();
    if (chunkRows.length === 0) continue;

    const embeddings = await embedTexts(chunkRows.map((c) => c.content));

    for (let i = 0; i < chunkRows.length; i++) {
      db.update(brainChunks)
        .set({ embedding: floatsToBuffer(embeddings[i]) })
        .where(eq(brainChunks.id, chunkRows[i].id))
        .run();
    }

    await addToIndex(
      chunkRows.map((row, i) => ({ id: row.id, documentId: doc.id, embedding: embeddings[i] })),
      {
        projectId: doc.projectId ?? null,
        sourceType: doc.sourceType,
        conversationId: conversationIdOf(doc.sourceType, doc.sourcePath),
      },
    );

    chunkCount += chunkRows.length;
  }

  return { documents: docs.length, chunks: chunkCount };
}

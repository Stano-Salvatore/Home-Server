import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainDocuments, brainChunks } from "@/server/db/schema";
import { chunkText, estimateTokenCount } from "./chunker";
import { embedTexts } from "./embeddings";
import { addToIndex, removeDocumentFromIndex, floatsToBuffer, conversationIdOf } from "./vectorStore";
import { sha1, newId } from "@/server/util/hash";

export type IngestSourceType = "obsidian" | "library" | "upload" | "manual" | "chat";

export function getDocumentBySourcePath(sourcePath: string) {
  return db.select().from(brainDocuments).where(eq(brainDocuments.sourcePath, sourcePath)).get();
}

export function listDocuments() {
  return db.select().from(brainDocuments).all();
}

export function getDocument(id: string) {
  return db.select().from(brainDocuments).where(eq(brainDocuments.id, id)).get();
}

/**
 * Ingests (or re-ingests, if content changed) a document into Brain.
 * Skips re-chunking/re-embedding when the content hash is unchanged, which is
 * what makes the Obsidian watcher's re-indexing incremental instead of full.
 */
export async function ingestDocument(opts: {
  sourceType: IngestSourceType;
  sourcePath: string;
  title: string;
  content: string;
  projectId?: string | null;
}): Promise<{ document: typeof brainDocuments.$inferSelect; unchanged: boolean }> {
  const contentHash = sha1(opts.content);
  const existing = getDocumentBySourcePath(opts.sourcePath);

  if (existing && existing.contentHash === contentHash) {
    return { document: existing, unchanged: true };
  }

  const documentId = existing?.id ?? newId("doc");

  if (existing) {
    db.delete(brainChunks).where(eq(brainChunks.documentId, documentId)).run();
    await removeDocumentFromIndex(documentId);
  }

  const chunks = chunkText(opts.content);
  const embeddings = chunks.length > 0 ? await embedTexts(chunks) : [];

  const now = Date.now();
  if (existing) {
    db.update(brainDocuments)
      .set({ title: opts.title, contentHash, indexedAt: now / 1000, updatedAt: now / 1000 })
      .where(eq(brainDocuments.id, documentId))
      .run();
  } else {
    db.insert(brainDocuments)
      .values({
        id: documentId,
        sourceType: opts.sourceType,
        sourcePath: opts.sourcePath,
        title: opts.title,
        projectId: opts.projectId ?? null,
        contentHash,
      })
      .run();
  }

  const chunkRows = chunks.map((content, i) => ({
    id: newId("chunk"),
    documentId,
    chunkIndex: i,
    content,
    tokenCount: estimateTokenCount(content),
    embedding: floatsToBuffer(embeddings[i]),
  }));

  for (const row of chunkRows) {
    db.insert(brainChunks).values(row).run();
  }

  await addToIndex(
    chunkRows.map((row, i) => ({ id: row.id, documentId, embedding: embeddings[i] })),
    {
      projectId: opts.projectId ?? null,
      sourceType: opts.sourceType,
      conversationId: conversationIdOf(opts.sourceType, opts.sourcePath),
    },
  );

  return { document: getDocument(documentId)!, unchanged: false };
}

export async function deleteDocument(id: string) {
  await removeDocumentFromIndex(id);
  db.delete(brainDocuments).where(eq(brainDocuments.id, id)).run();
}

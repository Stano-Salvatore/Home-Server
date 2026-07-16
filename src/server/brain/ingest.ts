import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainDocuments, brainChunks } from "@/server/db/schema";
import { chunkText, estimateTokenCount } from "./chunker";
import { cleanNoteContent } from "./cleanText";
import { embedTexts } from "./embeddings";
import { addToIndex, removeDocumentFromIndex, floatsToBuffer, conversationIdOf } from "./vectorStore";
import { ftsInsertChunks, ftsDeleteDocument } from "./lexical";
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
  // Cleaning happens before hashing on purpose: a cleaner-version bump makes
  // exactly the affected notes hash differently, so the next vault rescan
  // re-chunks them (and skips notes the cleaning doesn't change).
  const content = cleanNoteContent(opts.content);
  const contentHash = sha1(content);
  const existing = getDocumentBySourcePath(opts.sourcePath);

  if (existing && existing.contentHash === contentHash) {
    return { document: existing, unchanged: true };
  }

  const documentId = existing?.id ?? newId("doc");

  if (existing) {
    db.delete(brainChunks).where(eq(brainChunks.documentId, documentId)).run();
    ftsDeleteDocument(documentId);
    await removeDocumentFromIndex(documentId);
  }

  const chunks = chunkText(content);
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
  ftsInsertChunks(chunkRows.map((row) => ({ id: row.id, documentId, content: row.content })));

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
  // The chunks row delete cascades from the document FK, but the FTS shadow
  // table is a virtual table with no FK — it needs an explicit delete.
  ftsDeleteDocument(id);
  db.delete(brainDocuments).where(eq(brainDocuments.id, id)).run();
}

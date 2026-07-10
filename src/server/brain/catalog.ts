import { and, eq, inArray, isNull, like, ne, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainDocuments } from "@/server/db/schema";

// Enumeration-style questions ("list all my notes about X", "every book by
// X") are catalog queries, not semantic ones — top-K cosine similarity finds
// the closest few chunks, not all of them, so it silently drops matches.
const CATALOG_TRIGGER =
  /\b(list all|list every|all (of )?my|every (book|note|page)s?|what (books|notes) do i have|show all|complete list)\b/i;

export function isCatalogQuery(query: string): boolean {
  return CATALOG_TRIGGER.test(query);
}

// A loose proper-noun heuristic (a run of capitalized words, diacritics
// included) — good enough to pull "Egon Bondy" out of "list all books by
// Egon Bondy" without a real NER model.
export function extractCatalogKeyword(query: string): string | null {
  const stripped = query.replace(CATALOG_TRIGGER, " ");
  const match = stripped.match(
    /\b([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\wá-žÁ-Ž'-]*(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\wá-žÁ-Ž'-]*){0,2})\b/,
  );
  return match ? match[1].trim() : null;
}

export type CatalogHit = { documentId: string; title: string; sourcePath: string };

/**
 * Exhaustive keyword match across document titles + folder paths — the
 * counterpart to top-K semantic search for "list everything by X" questions.
 * Not scored/ranked, just every match, capped so it can't blow the context.
 */
export function catalogSearch(
  keyword: string,
  projectId: string | null,
  scopeDocIds?: string[] | null,
  limit = 40,
): CatalogHit[] {
  const needle = `%${keyword}%`;
  const conditions = [
    or(like(brainDocuments.title, needle), like(brainDocuments.sourcePath, needle))!,
    ne(brainDocuments.sourceType, "chat"),
    projectId
      ? or(isNull(brainDocuments.projectId), eq(brainDocuments.projectId, projectId))!
      : isNull(brainDocuments.projectId),
  ];
  if (scopeDocIds) conditions.push(inArray(brainDocuments.id, scopeDocIds));

  const rows = db
    .select({ id: brainDocuments.id, title: brainDocuments.title, sourcePath: brainDocuments.sourcePath })
    .from(brainDocuments)
    .where(and(...conditions))
    .limit(limit)
    .all();

  return rows.map((r) => ({ documentId: r.id, title: r.title, sourcePath: r.sourcePath }));
}

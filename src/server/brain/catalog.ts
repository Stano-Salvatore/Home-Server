import { and, eq, inArray, isNull, like, ne, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainDocuments } from "@/server/db/schema";

// Enumeration-style questions ("list all my notes about X", "every book by
// X", "what books by X have I read") are catalog queries, not semantic ones
// — top-K cosine similarity finds the closest few chunks, not all of them,
// so it silently drops matches.
const CATALOG_TRIGGER =
  /\b(list all|list every|list everything|all (of )?my|every (book|note|page)s?|(what|which) (books|notes)|show all|show everything|everything (do i|you) (have|know)|complete list|have i read|did i read)\b/i;

export function isCatalogQuery(query: string): boolean {
  return CATALOG_TRIGGER.test(query);
}

// Filler words dropped from anywhere in the sentence (not just the leading
// trigger phrase) — "what books BY egon bondy HAVE I READ" needs "by",
// "have", "i", "read" all stripped, not just whatever the trigger matched.
// SQLite's LIKE is already ASCII case-insensitive, so "bondy"/"Bondy"/
// "BONDY" all match the same title either way; this only has to isolate the
// name, not normalize its case.
const STOPWORDS = new Set([
  "a", "an", "the", "my", "me", "you", "your", "i",
  "have", "has", "had", "do", "does", "did", "read", "got", "own", "know", "saved",
  "books", "book", "notes", "note", "pages", "page", "authors", "author", "topics", "topic",
  "by", "about", "on", "of", "from", "and", "or", "across", "everything", "anything",
  "regarding", "related", "to", "concerning", "for", "in",
  "what", "which", "all", "every", "list", "show", "complete",
  // Question-starters and agent names — "Can Athena list..." otherwise reads
  // as a capitalized proper-noun run ("Can Athena") and gets mistaken for
  // the thing to search for, since sentence-initial words are capitalized
  // regardless of whether they're actually a name.
  "can", "could", "would", "should", "will", "is", "are",
  "athena", "emergi", "gemmi",
]);

// A hyphenated word like "authors-books" should drop out entirely if every
// part of it is filler — otherwise "list all ... authors-books" leaves a
// garbage compound as the "keyword" instead of correctly resolving to null
// (list everything). A real compound name like "self-portrait" is untouched
// since not all of its parts are stopwords.
function isAllStopwordParts(token: string): boolean {
  return token.split("-").every((part) => STOPWORDS.has(part.toLowerCase()));
}

export function extractCatalogKeyword(query: string): string | null {
  const words = query
    .replace(/[?.!]+$/, "")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()) && !isAllStopwordParts(w));
  if (words.length === 0) return null;
  const joined = words.join(" ");

  // Prefer a capitalized proper-noun run when present — more precise than
  // grabbing everything left over. Falls back to whatever remains (any
  // case) once filler words are stripped, e.g. "bondy" with no capital.
  const properNoun = joined.match(
    /\b([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\wá-žÁ-Ž'-]*(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\wá-žÁ-Ž'-]*){0,2})\b/,
  );
  return (properNoun ? properNoun[1] : joined).trim() || null;
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

/**
 * "List everything" with no specific author/topic to filter by — a genuinely
 * different request from catalogSearch (which needs a keyword to match
 * against). Returns every document, sorted by folder path so notes under the
 * same author naturally group together. Capped higher than catalogSearch
 * since it's meant to cover the whole vault, not one branch of it.
 */
export function catalogListAll(
  projectId: string | null,
  scopeDocIds?: string[] | null,
  limit = 80,
): CatalogHit[] {
  const conditions = [
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
    .orderBy(brainDocuments.sourcePath)
    .limit(limit)
    .all();

  return rows.map((r) => ({ documentId: r.id, title: r.title, sourcePath: r.sourcePath }));
}

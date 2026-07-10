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

// Filler words between the trigger phrase and the actual name ("books BY
// bondy", "notes ABOUT egon bondy") — stripped repeatedly so casing never
// matters. SQLite's LIKE is already ASCII case-insensitive by default, so
// "bondy" / "Bondy" / "BONDY" all match the same title either way; this only
// has to find where the name starts, not normalize its case.
const CONNECTOR_WORDS = /^\s*(books?|notes?|pages?|by|about|on|of|regarding|related to|concerning|for)\s+/i;

export function extractCatalogKeyword(query: string): string | null {
  let stripped = query.replace(CATALOG_TRIGGER, " ").trim();
  let prev: string;
  do {
    prev = stripped;
    stripped = stripped.replace(CONNECTOR_WORDS, "").trim();
  } while (stripped !== prev && stripped.length > 0);
  if (!stripped) return null;

  // Prefer a capitalized proper-noun run when present — more precise than
  // grabbing everything left over. Falls back to whatever text remains
  // (any case) once filler words are stripped, e.g. "bondy" with no capital.
  const properNoun = stripped.match(
    /\b([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\wá-žÁ-Ž'-]*(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\wá-žÁ-Ž'-]*){0,2})\b/,
  );
  if (properNoun) return properNoun[1].trim();
  return stripped.replace(/[?.!]+$/, "").trim() || null;
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

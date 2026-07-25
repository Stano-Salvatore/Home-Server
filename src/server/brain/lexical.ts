import { sqlite } from "@/server/db/client";

// BM25 keyword search over the brain_chunks_fts shadow table (FTS5,
// unicode61 with remove_diacritics 2 so "Klima" matches "Klíma"). This is
// the lexical half of hybrid retrieval: proper names embed poorly in small
// embedding models, but an exact-token match is trivial for BM25.

export type LexicalHit = { id: string; documentId: string; score: number };

// Raw user text contains FTS5 syntax characters (quotes, -, *, :) that make
// MATCH throw, so the query is rebuilt as quoted word tokens joined with OR.
// OR (not AND) because most words of a natural-language question won't be in
// any note — BM25's IDF weighting already ranks the rare, meaningful tokens
// on top. Tokens under 3 chars are dropped as noise unless that would empty
// the query entirely.
function toMatchQuery(query: string): string | null {
  const tokens = query
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
  const meaningful = tokens.filter((t) => t.length >= 3);
  const kept = meaningful.length > 0 ? meaningful : tokens;
  if (kept.length === 0) return null;
  return kept.map((t) => `"${t.replaceAll('"', '""')}"`).join(" OR ");
}

export function searchLexical(query: string, topK: number): LexicalHit[] {
  const match = toMatchQuery(query);
  if (!match) return [];
  try {
    const rows = sqlite
      .prepare(
        `SELECT chunk_id, document_id, bm25(brain_chunks_fts) AS rank
         FROM brain_chunks_fts
         WHERE brain_chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(match, topK) as { chunk_id: string; document_id: string; rank: number }[];
    // SQLite's bm25() is lower-is-better (negative for matches); negate so
    // callers get the usual higher-is-better score.
    return rows.map((r) => ({ id: r.chunk_id, documentId: r.document_id, score: -r.rank }));
  } catch (err) {
    // Missing FTS table (migration not yet applied) or FTS5-less SQLite
    // build: degrade to dense-only retrieval rather than breaking search.
    console.error("[brain] lexical search failed:", err);
    return [];
  }
}

// ---------- FTS write-side mirror ----------
// The FTS table is an index over brain_chunks, not a source of truth — a
// failed write here must never fail the ingest itself (a reindex rebuilds it).

export function ftsInsertChunks(rows: { id: string; documentId: string; content: string }[]) {
  if (rows.length === 0) return;
  try {
    const stmt = sqlite.prepare(
      "INSERT INTO brain_chunks_fts(content, chunk_id, document_id) VALUES (?, ?, ?)",
    );
    for (const row of rows) stmt.run(row.content, row.id, row.documentId);
  } catch (err) {
    console.error("[brain] FTS insert failed:", err);
  }
}

export function ftsDeleteDocument(documentId: string) {
  try {
    sqlite.prepare("DELETE FROM brain_chunks_fts WHERE document_id = ?").run(documentId);
  } catch (err) {
    console.error("[brain] FTS delete failed:", err);
  }
}

export function ftsDeleteAll() {
  try {
    sqlite.exec("DELETE FROM brain_chunks_fts");
  } catch (err) {
    console.error("[brain] FTS clear failed:", err);
  }
}

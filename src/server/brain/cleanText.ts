// Cleanup for note text at two distinct layers:
//
// - cleanNoteContent: at chunk-creation time (ingest), so newly indexed
//   content is clean for embedding, FTS and display alike. Changing it
//   changes the content hash, so a vault rescan re-ingests exactly the notes
//   whose text it affects — that's the backfill mechanism.
// - presentChunk: at render/context-build time only, over raw stored chunk
//   content. Covers chunks ingested before cleanNoteContent existed without
//   mutating stored rows (FTS indexing and embeddings must keep matching the
//   stored text).

// Notion-export / hand-written inline metadata like "**Autor :** Egon Bondy"
// (or the malformed "***Autor :** Egon* *Bondy*" it degrades into once
// emphasis markers get unbalanced). Normalized to a plain "Autor: Egon Bondy"
// line so it reads as a structured fact instead of markdown scaffolding, and
// so no unpaired asterisks survive to corrupt later rendering. Field names
// are short and colon-free by construction — real prose with a mid-sentence
// bold span doesn't match, and requiring two leading asterisks keeps
// single-asterisk markdown bullets ("* item: description") untouched.
// The closing bold marker lands on either side of the colon in the wild
// ("**Autor :** Egon Bondy" and "**Rok** : ---" both appear), so asterisks
// are optional in both positions.
const METADATA_LINE = /^\s*\*{2,3}\s*([^*\n:]{1,40}?)\s*\*{0,3}\s*:\s*\*{0,3}\s*(.*)$/;

function normalizeMetadataLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const m = line.match(METADATA_LINE);
      if (!m) return line;
      const value = m[2].replaceAll("*", "").trim();
      return `${m[1].trim()}: ${value}`;
    })
    .join("\n");
}

/** Chunk-creation-time cleanup, applied to document content before hashing/chunking. */
export function cleanNoteContent(content: string): string {
  let text = content.replace(/\r\n/g, "\n");
  // YAML frontmatter is already stripped by gray-matter on the Obsidian
  // paths; this catches uploads/manual ingests that skip that path.
  text = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  text = normalizeMetadataLines(text);
  // Cleanup can leave runs of blank lines; keep paragraph breaks only.
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/**
 * Presentation-only cleanup for a chunk shown to the user or fed into the
 * RAG context block. Never applied to stored data.
 */
export function presentChunk(content: string, title?: string): string {
  let text = normalizeMetadataLines(content.replace(/\r\n/g, "\n")).trim();
  // Drop a leading "# Heading" that just repeats the document title — the
  // two are always displayed together, so the repetition is pure noise.
  if (title) {
    const lines = text.split("\n");
    const heading = lines[0]?.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading && heading[1].trim().toLowerCase() === title.trim().toLowerCase()) {
      text = lines.slice(1).join("\n").trimStart();
    }
  }
  return text;
}

import { appendToNote } from "./writer";

// Turning a conversation about a book into a note in the reading vault.
//
// This deliberately is NOT a planner tool. Tool calls are planned from the
// latest user message alone, and "ulož to" carries neither the book, the
// author, nor anything worth writing down — the planner would have to invent
// all three. The material lives in the conversation, so the whole
// conversation is what gets read.
//
// The vault is organised the way Salvatore has kept it for years: a folder per
// author, one note per book, opening with "# Title" and a short author/year
// block. New notes follow that shape so they sit among the existing ones.

export type BookNoteDraft = { title: string; author: string; year?: string; notes: string };

/** Slashes would silently become folders and misfile the note. */
function flatten(value: string): string {
  return value.replace(/[\\/]/g, " ").replace(/\s+/g, " ").trim();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const BOOK_NOTE_PROMPT =
  "You are reading a conversation between Salvatore and his assistant about a book.\n" +
  "Write the note he would want to keep in his reading vault.\n\n" +
  "Reply with JSON only, no prose around it:\n" +
  '{"title": "the book\'s title", "author": "the author\'s full name", "year": "", ' +
  '"notes": "the note itself, in markdown"}\n\n' +
  "Rules:\n" +
  "- title is the book's title ALONE, as it appears on the cover. Strip everything the\n" +
  "  speaker wrapped around it: \"Čítam Kafka na pobreží od Murakamiho\" has the title\n" +
  "  \"Kafka na pobreží\" — not the verb, not the word for \"by\", not the author. The title\n" +
  "  becomes a filename, so anything extra misfiles the note.\n" +
  "- author is the author's name alone, in the nominative: \"Haruki Murakami\", never\n" +
  "  \"od Harukiho Murakamiho\".\n" +
  "- If the conversation never names a book, return\n" +
  "  {\"title\": \"\", \"author\": \"\", \"notes\": \"\"} and nothing else.\n" +
  "- notes must contain everything from the conversation worth keeping about that book:\n" +
  "  themes, characters, structure, his own opinions and reactions, anything he noticed.\n" +
  "  Organise it with markdown headings. Do NOT compress it to a sentence.\n" +
  "- Write notes in the language the conversation was in.\n" +
  "- Record his thoughts as his, and do not invent facts about the book that were not said.";

/** Pull the JSON object out of a model reply that may be wrapped in prose or fences. */
export function parseBookNoteDraft(raw: string): BookNoteDraft | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Partial<BookNoteDraft>;
    const title = typeof parsed.title === "string" ? flatten(parsed.title) : "";
    const author = typeof parsed.author === "string" ? flatten(parsed.author) : "";
    const notes = typeof parsed.notes === "string" ? parsed.notes.trim() : "";
    if (!title || !author || !notes) return null;
    return { title, author, notes, year: typeof parsed.year === "string" ? parsed.year.trim() : "" };
  } catch {
    return null;
  }
}

/**
 * Files a book note under its author. Never overwrites: a book that already
 * has a note gets a new dated section appended, because those notes are years
 * of Salvatore's own reading and are irreplaceable.
 */
export async function saveBookNote(draft: BookNoteDraft): Promise<{ path: string; created: boolean }> {
  const title = flatten(draft.title);
  const author = flatten(draft.author);
  if (!title) throw new Error("The note needs a book title.");
  if (!author) throw new Error("The note needs an author, so it can be filed.");
  if (!draft.notes.trim()) throw new Error("There is nothing to write.");

  const createWith =
    `# ${title}\n\n` +
    `Owner: Stanislav Nándory\n\n` +
    `***Autor :***   ${author}\n` +
    (draft.year ? `\n**Rok**   :   **${draft.year}**\n` : "");

  return appendToNote({
    filename: `${author}/${title}`,
    header: `## Poznámky z rozhovoru — ${today()}`,
    body: draft.notes.trim(),
    createWith,
  });
}

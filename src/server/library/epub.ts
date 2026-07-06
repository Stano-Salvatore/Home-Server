import { EPub } from "epub2";
import { htmlToText } from "html-to-text";

export type ParsedEpub = {
  title: string;
  author: string | null;
  text: string;
  cover: { data: Buffer; mimeType: string } | null;
};

export async function parseEpub(filePath: string): Promise<ParsedEpub> {
  const epub = await EPub.createAsync(filePath);

  const title = (epub.metadata.title as string) || "Untitled";
  const author = (epub.metadata.creator as string) || null;

  const chapterTexts: string[] = [];
  for (const chapter of epub.flow) {
    if (!chapter.id) continue;
    try {
      const html = await epub.getChapterAsync(chapter.id);
      chapterTexts.push(htmlToText(html, { wordwrap: false }));
    } catch {
      // Some chapters (e.g. cover pages) can fail to parse; skip them.
    }
  }

  let cover: ParsedEpub["cover"] = null;
  const coverId = epub.metadata.cover as string | undefined;
  if (coverId) {
    try {
      const [data, mimeType] = await epub.getImageAsync(coverId);
      cover = { data, mimeType };
    } catch {
      // No usable cover image; caller falls back to a generated placeholder.
    }
  }

  return { title, author, text: chapterTexts.join("\n\n"), cover };
}

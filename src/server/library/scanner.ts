import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { libraryBooks } from "@/server/db/schema";
import { loadSettings } from "@/server/settings/config";
import { sha1, newId } from "@/server/util/hash";
import { ingestDocument } from "@/server/brain/ingest";
import { parseEpub } from "./epub";
import { parsePdf } from "./pdf";
import { saveCover } from "./covers";

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(epub|pdf)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export function listBooks() {
  return db.select().from(libraryBooks).all();
}

export function getBook(id: string) {
  return db.select().from(libraryBooks).where(eq(libraryBooks.id, id)).get();
}

export async function scanLibrary(): Promise<{ scanned: number; added: number; updated: number }> {
  const { libraryPath } = loadSettings();
  if (!fs.existsSync(libraryPath)) return { scanned: 0, added: 0, updated: 0 };

  const files = walk(libraryPath);
  let added = 0;
  let updated = 0;

  for (const filePath of files) {
    const buffer = fs.readFileSync(filePath);
    const fileHash = sha1(buffer);
    const existing = db.select().from(libraryBooks).where(eq(libraryBooks.filePath, filePath)).get();

    if (existing && existing.fileHash === fileHash) continue;

    const format = filePath.toLowerCase().endsWith(".epub") ? "epub" : "pdf";
    const bookId = existing?.id ?? newId("book");

    let title = path.basename(filePath).replace(/\.(epub|pdf)$/i, "");
    let author: string | null = null;
    let text = "";
    let cover: { data: Buffer; mimeType: string } | null = null;

    try {
      if (format === "epub") {
        const parsed = await parseEpub(filePath);
        title = parsed.title || title;
        author = parsed.author;
        text = parsed.text;
        cover = parsed.cover;
      } else {
        const parsed = await parsePdf(buffer);
        title = parsed.title || title;
        author = parsed.author;
        text = parsed.text;
      }
    } catch (err) {
      console.error(`[library] failed to parse ${filePath}:`, err);
    }

    const coverPath = await saveCover(bookId, cover, title, author);

    let brainDocumentId: string | null = null;
    if (text.trim()) {
      try {
        const { document } = await ingestDocument({
          sourceType: "library",
          sourcePath: filePath,
          title,
          content: text,
        });
        brainDocumentId = document.id;
      } catch (err) {
        console.error(`[library] failed to index ${filePath} into Brain:`, err);
      }
    }

    const row = {
      id: bookId,
      filePath,
      format,
      title,
      author,
      coverPath,
      textExtracted: text.trim().length > 0,
      brainDocumentId,
      fileHash,
    };

    if (existing) {
      db.update(libraryBooks).set(row).where(eq(libraryBooks.id, bookId)).run();
      updated++;
    } else {
      db.insert(libraryBooks).values(row).run();
      added++;
    }
  }

  return { scanned: files.length, added, updated };
}

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { files } from "@/server/db/schema";
import { loadSettings } from "@/server/settings/config";
import { newId } from "@/server/util/hash";
import { ingestDocument } from "@/server/brain/ingest";
import { parsePdf } from "@/server/library/pdf";

const TEXT_EXTRACTABLE_MIME = new Set(["text/plain", "text/markdown", "application/pdf"]);

function kindForMime(mimeType: string): "image" | "document" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (TEXT_EXTRACTABLE_MIME.has(mimeType) || mimeType.startsWith("text/")) return "document";
  return "other";
}

function extFromName(name: string): string {
  const ext = path.extname(name);
  return ext || "";
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    if (mimeType === "application/pdf") {
      const parsed = await parsePdf(buffer);
      return parsed.text;
    }
    if (mimeType.startsWith("text/")) {
      return buffer.toString("utf-8");
    }
  } catch (err) {
    console.error(`[files] failed to extract text (${mimeType}):`, err);
  }
  return null;
}

export function listFiles() {
  return db.select().from(files).orderBy(files.createdAt).all();
}

export function getFile(id: string) {
  return db.select().from(files).where(eq(files.id, id)).get();
}

export async function saveUploadedFile(opts: {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<typeof files.$inferSelect> {
  const { uploadsPath } = loadSettings();
  fs.mkdirSync(uploadsPath, { recursive: true });

  const id = newId("file");
  const ext = extFromName(opts.originalName);
  const storedName = `${id}${ext}`;
  const storedPath = path.join(uploadsPath, storedName);
  fs.writeFileSync(storedPath, opts.buffer);

  const kind = kindForMime(opts.mimeType);

  // No server-side thumbnailing (that needed the native `sharp` module, which
  // can't build on Android/Termux). Images render from the full-content
  // endpoint instead — the browser scales them down in the grid.
  const thumbnailPath: string | null = null;

  let brainDocumentId: string | null = null;
  if (kind === "document") {
    const text = await extractText(opts.buffer, opts.mimeType);
    if (text?.trim()) {
      try {
        const { document } = await ingestDocument({
          sourceType: "upload",
          sourcePath: storedPath,
          title: opts.originalName,
          content: text,
        });
        brainDocumentId = document.id;
      } catch (err) {
        console.error(`[files] failed to index ${opts.originalName} into Brain:`, err);
      }
    }
  }

  const row = {
    id,
    originalName: opts.originalName,
    storedName,
    mimeType: opts.mimeType,
    sizeBytes: opts.buffer.length,
    kind,
    thumbnailPath,
    brainDocumentId,
  };
  db.insert(files).values(row).run();
  return getFile(id)!;
}

export function deleteFile(id: string) {
  const { uploadsPath } = loadSettings();
  const file = getFile(id);
  if (!file) return;

  const storedPath = path.join(uploadsPath, file.storedName);
  if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
  if (file.thumbnailPath && fs.existsSync(file.thumbnailPath)) fs.unlinkSync(file.thumbnailPath);

  db.delete(files).where(eq(files.id, id)).run();
}

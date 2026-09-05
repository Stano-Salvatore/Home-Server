import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { loadSettings } from "@/server/settings/config";
import { ingestDocument } from "@/server/brain/ingest";
import { vaultPaths } from "./vaults";

// New notes are written into the first configured vault (falling back to the
// legacy single vaultPath setting) — the one the user thinks of as their main
// notebook when they hit "Save to Obsidian".
function primaryVaultPath(): string {
  return vaultPaths()[0] || loadSettings().vaultPath;
}

const SELF_WRITE_TTL_MS = 2000;

declare global {
  var __homeServerSelfWritten: Map<string, ReturnType<typeof setTimeout>> | undefined;
}

// globalThis-backed for the same reason as vectorStore.ts/watcher.ts: the
// writer (called from an API route) and the watcher (bootstrapped via
// instrumentation) aren't guaranteed to share a plain module-level Map.
function selfWrittenMap() {
  if (!globalThis.__homeServerSelfWritten) globalThis.__homeServerSelfWritten = new Map();
  return globalThis.__homeServerSelfWritten;
}

export function markSelfWritten(absolutePath: string) {
  const map = selfWrittenMap();
  const existing = map.get(absolutePath);
  if (existing) clearTimeout(existing);
  map.set(
    absolutePath,
    setTimeout(() => map.delete(absolutePath), SELF_WRITE_TTL_MS),
  );
}

export function wasRecentlySelfWritten(absolutePath: string) {
  return selfWrittenMap().has(absolutePath);
}

// opts.filename may be a plain name ("chat-note-123") or include a folder
// prefix ("Books/Egon Bondy/chat-note-123") — sanitize each path segment on
// its own so illegal filename characters get stripped without destroying
// the "/" separators that make the folder placement work. "." and ".."
// segments are dropped outright (the vaultRoot prefix check below is the
// real traversal guard, but there's no reason to let them through here).
function sanitizeRelativePath(name: string): string {
  const segments = name
    .split("/")
    .map((seg) => seg.replace(/[\\?%*:|"<>]/g, "-").trim())
    .filter((seg) => seg && seg !== "." && seg !== "..");
  return segments.join("/") || "untitled";
}

/**
 * Given a citation's absolute sourcePath, returns the vault-relative folder
 * it lives in (e.g. "Books/Egon Bondy"), or null if it isn't a real file
 * inside this vault — a Wikipedia URL, a Library book (indexed from outside
 * the vault), a flat "manual/..." note, or chat memory all have no folder a
 * new note should be filed under.
 */
export function folderForCitation(sourcePath: string): string | null {
  if (!sourcePath) return null;
  const vaultPath = primaryVaultPath();
  if (!vaultPath) return null;
  const vaultRoot = path.resolve(vaultPath) + path.sep;
  const abs = path.resolve(sourcePath);
  if (!abs.startsWith(vaultRoot)) return null;
  const rel = path.dirname(abs.slice(vaultRoot.length));
  return rel === "." ? null : rel;
}

/**
 * Writes a markdown note into the vault, guards against path traversal,
 * and ingests it into Brain immediately so it's searchable without waiting
 * for the file watcher's debounce.
 */
export async function writeNote(opts: {
  filename: string;
  content: string;
  frontmatter?: Record<string, unknown>;
}): Promise<string> {
  const vaultPath = primaryVaultPath();
  if (!vaultPath) throw new Error("No Obsidian vault configured");

  const safeName = sanitizeRelativePath(opts.filename);
  const relativePath = safeName.endsWith(".md") ? safeName : `${safeName}.md`;
  const absolutePath = path.resolve(vaultPath, relativePath);

  const vaultRoot = path.resolve(vaultPath) + path.sep;
  if (!absolutePath.startsWith(vaultRoot)) {
    throw new Error("Refusing to write outside the configured vault path");
  }

  const fileContent = opts.frontmatter
    ? matter.stringify(opts.content, opts.frontmatter)
    : opts.content;

  markSelfWritten(absolutePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, fileContent, "utf-8");

  await ingestDocument({
    sourceType: "obsidian",
    sourcePath: absolutePath,
    title: path.basename(safeName, ".md"),
    content: opts.content,
  });

  return absolutePath;
}

/**
 * Adds a section to a note, creating it if it isn't there yet.
 *
 * The vault is years of Salvatore's own reading notes, so an assistant that
 * can write into it must never be able to replace one. Existing files are
 * only ever appended to; `header` separates the new section from whatever was
 * already written, and the original text is preserved byte for byte.
 */
export async function appendToNote(opts: {
  filename: string;
  header: string;
  body: string;
  /** Used only when the note does not exist yet. */
  createWith?: string;
}): Promise<{ path: string; created: boolean }> {
  const vaultPath = primaryVaultPath();
  if (!vaultPath) throw new Error("No Obsidian vault configured");

  const safeName = sanitizeRelativePath(opts.filename);
  const relativePath = safeName.endsWith(".md") ? safeName : `${safeName}.md`;
  const absolutePath = path.resolve(vaultPath, relativePath);
  const vaultRoot = path.resolve(vaultPath) + path.sep;
  if (!absolutePath.startsWith(vaultRoot)) {
    throw new Error("Refusing to write outside the configured vault path");
  }

  const exists = fs.existsSync(absolutePath);
  const existing = exists ? fs.readFileSync(absolutePath, "utf-8") : (opts.createWith ?? "");
  const separator = existing.trim() === "" ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  const content = `${existing}${separator}${opts.header}\n\n${opts.body}\n`;

  markSelfWritten(absolutePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf-8");

  await ingestDocument({
    sourceType: "obsidian",
    sourcePath: absolutePath,
    title: path.basename(safeName, ".md"),
    content,
  });

  return { path: absolutePath, created: !exists };
}

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { loadSettings } from "@/server/settings/config";
import { ingestDocument } from "@/server/brain/ingest";

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

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "untitled";
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
  const { vaultPath } = loadSettings();
  if (!vaultPath) throw new Error("No Obsidian vault configured");

  const safeName = sanitizeFilename(opts.filename);
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
    title: safeName.replace(/\.md$/, ""),
    content: opts.content,
  });

  return absolutePath;
}

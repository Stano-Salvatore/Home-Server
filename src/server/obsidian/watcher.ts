import path from "node:path";
import fs from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";
import matter from "gray-matter";
import { ingestDocument, getDocumentBySourcePath, deleteDocument } from "@/server/brain/ingest";
import { wasRecentlySelfWritten } from "./writer";

declare global {
  var __homeServerVaultWatcher: FSWatcher | null | undefined;
  var __homeServerWatchedVaultPath: string | null | undefined;
}

// See vectorStore.ts for why this needs to be a globalThis singleton rather
// than a plain module-level variable: the settings API route (which calls
// restartVaultWatcher) and instrumentation's bootstrap (which calls
// startVaultWatcher) are not guaranteed to share the same module instance.

async function handleUpsert(absolutePath: string) {
  if (wasRecentlySelfWritten(absolutePath)) return;
  try {
    const raw = fs.readFileSync(absolutePath, "utf-8");
    const { data, content } = matter(raw);
    const filenameTitle = path.basename(absolutePath).replace(/\.md$/, "");
    const title = typeof data.title === "string" ? data.title : filenameTitle;
    const { unchanged } = await ingestDocument({
      sourceType: "obsidian",
      sourcePath: absolutePath,
      title,
      content: content.trim() || raw,
    });
    if (!unchanged) console.log(`[obsidian] indexed ${path.basename(absolutePath)}`);
  } catch (err) {
    console.error(`[obsidian] failed to index ${absolutePath}:`, err);
  }
}

function handleUnlink(absolutePath: string) {
  const doc = getDocumentBySourcePath(absolutePath);
  if (doc) {
    deleteDocument(doc.id);
    console.log(`[obsidian] removed ${path.basename(absolutePath)} from Brain`);
  }
}

export function startVaultWatcher(vaultPath: string) {
  if (globalThis.__homeServerVaultWatcher) {
    globalThis.__homeServerVaultWatcher.close();
    globalThis.__homeServerVaultWatcher = null;
  }
  if (!vaultPath) {
    globalThis.__homeServerWatchedVaultPath = null;
    return;
  }

  globalThis.__homeServerWatchedVaultPath = vaultPath;
  // chokidar v5 dropped glob-pattern support in the watch path itself, so we
  // watch the directory and filter to markdown files ourselves.
  const watcher = chokidar.watch(".", {
    cwd: vaultPath,
    ignoreInitial: false,
    ignored: (filePath, stats) => (stats?.isFile() ? !filePath.endsWith(".md") : false),
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher
    .on("add", (relativePath) => handleUpsert(path.join(vaultPath, relativePath)))
    .on("change", (relativePath) => handleUpsert(path.join(vaultPath, relativePath)))
    .on("unlink", (relativePath) => handleUnlink(path.join(vaultPath, relativePath)))
    .on("error", (err) => console.error("[obsidian] watcher error:", err));

  globalThis.__homeServerVaultWatcher = watcher;
  console.log(`[obsidian] watching ${vaultPath} for markdown changes`);
}

export async function restartVaultWatcher(vaultPath: string) {
  startVaultWatcher(vaultPath);
}

export function getWatchedVaultPath() {
  return globalThis.__homeServerWatchedVaultPath ?? null;
}

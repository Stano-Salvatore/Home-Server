import path from "node:path";
import fs from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";
import matter from "gray-matter";
import { ingestDocument, getDocumentBySourcePath, deleteDocument } from "@/server/brain/ingest";
import { wasRecentlySelfWritten } from "./writer";
import { vaultPaths } from "./vaults";

declare global {
  // Map of vault path -> its live watcher, so several vaults are watched at once.
  var __homeServerVaultWatchers: Map<string, FSWatcher> | undefined;
}

// See vectorStore.ts for why this needs to be a globalThis singleton rather
// than a plain module-level variable: the settings API route (which calls
// restartVaultWatchers) and instrumentation's bootstrap (which calls
// startVaultWatchers) are not guaranteed to share the same module instance.

function watchers(): Map<string, FSWatcher> {
  if (!globalThis.__homeServerVaultWatchers) {
    globalThis.__homeServerVaultWatchers = new Map();
  }
  return globalThis.__homeServerVaultWatchers;
}

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

function watchOne(vaultPath: string) {
  if (!vaultPath || watchers().has(vaultPath)) return;
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

  watchers().set(vaultPath, watcher);
  console.log(`[obsidian] watching ${vaultPath} for markdown changes`);
}

/**
 * Start (or reconcile) watchers so exactly the configured vault paths are
 * watched: new paths get a watcher, removed paths are closed.
 */
export function startVaultWatchers(paths: string[] = vaultPaths()) {
  const wanted = new Set(paths.filter(Boolean));
  // Drop watchers for vaults that no longer exist in the config.
  for (const [existingPath, watcher] of watchers()) {
    if (!wanted.has(existingPath)) {
      watcher.close();
      watchers().delete(existingPath);
    }
  }
  for (const p of wanted) {
    if (fs.existsSync(p)) watchOne(p);
  }
}

export async function restartVaultWatchers(paths: string[] = vaultPaths()) {
  startVaultWatchers(paths);
}

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

export type VaultRescan = { total: number; indexed: number; errors: string[] };

/**
 * Manually re-index a single vault. Needed on Android/Termux, where shared
 * storage often doesn't emit inotify events, so the live watcher can miss
 * edits made in the Obsidian app. Hash-gated ingest makes this cheap to repeat.
 * Errors (e.g. the embedding model not being pulled) are collected and
 * returned so the UI can tell the user *why* nothing indexed.
 */
export async function rescanVault(vaultPath: string): Promise<VaultRescan> {
  const files = walkMarkdown(vaultPath);
  let indexed = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const { data, content } = matter(raw);
      const filenameTitle = path.basename(file).replace(/\.md$/, "");
      const title = typeof data.title === "string" ? data.title : filenameTitle;
      const { unchanged } = await ingestDocument({
        sourceType: "obsidian",
        sourcePath: file,
        title,
        content: content.trim() || raw,
      });
      if (!unchanged) indexed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[obsidian] rescan failed for ${file}:`, err);
      // Keep the list short — one representative error is enough to diagnose.
      if (errors.length < 3) errors.push(`${path.basename(file)}: ${msg}`);
    }
  }
  return { total: files.length, indexed, errors };
}

export type VaultRescanResult = VaultRescan & { id: string; name: string; path: string };

/**
 * Rescan every configured vault, returning per-vault results so the Settings
 * UI can show how many notes each vault indexed and surface any errors.
 */
export async function rescanAllVaults(): Promise<VaultRescanResult[]> {
  const { listVaults } = await import("./vaults");
  const results: VaultRescanResult[] = [];
  for (const vault of listVaults()) {
    const stats = await rescanVault(vault.path);
    results.push({ id: vault.id, name: vault.name, path: vault.path, ...stats });
  }
  return results;
}

export function getWatchedVaultPaths(): string[] {
  return [...watchers().keys()];
}

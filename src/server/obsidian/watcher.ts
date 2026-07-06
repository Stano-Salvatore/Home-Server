// Full chokidar-based two-way sync is implemented in phase 5 (Obsidian sync).
// For now this just tracks whether a watcher "should" be running so bootstrap
// and the settings page have something real to call.

let currentVaultPath: string | null = null;

export function startVaultWatcher(vaultPath: string) {
  currentVaultPath = vaultPath;
  console.log(`[obsidian] watcher stub started for ${vaultPath}`);
}

export async function restartVaultWatcher(vaultPath: string) {
  currentVaultPath = vaultPath;
  console.log(`[obsidian] watcher stub restarted for ${vaultPath}`);
}

export function getWatchedVaultPath() {
  return currentVaultPath;
}

import fs from "node:fs";
import { db } from "@/server/db/client";
import { loadSettings, pathStatus } from "@/server/settings/config";

let bootstrapped = false;

export async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  // Touch the DB (runs migrations as a side effect of import) and load config.
  void db;
  const config = loadSettings();

  fs.mkdirSync(config.uploadsPath, { recursive: true });
  fs.mkdirSync(config.libraryPath, { recursive: true });

  const { recoverRunningServers } = await import("@/server/backends/llamacpp");
  await recoverRunningServers();

  const { loadVectorIndex } = await import("@/server/brain/vectorStore");
  loadVectorIndex();

  if (pathStatus(config.vaultPath).exists) {
    const { startVaultWatcher } = await import("@/server/obsidian/watcher");
    startVaultWatcher(config.vaultPath);
  }

  const { startScheduler } = await import("@/server/tasks/scheduler");
  startScheduler();

  console.log("[bootstrap] Home Server ready.");
}

import fs from "node:fs";
import { runMigrations } from "@/server/db/client";
import { loadSettings } from "@/server/settings/config";

let bootstrapped = false;

export async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  runMigrations();
  const config = loadSettings();

  fs.mkdirSync(config.uploadsPath, { recursive: true });
  fs.mkdirSync(config.libraryPath, { recursive: true });

  const { recoverRunningServers } = await import("@/server/backends/llamacpp");
  await recoverRunningServers();

  const { loadVectorIndex } = await import("@/server/brain/vectorStore");
  await loadVectorIndex();

  const { startVaultWatchers } = await import("@/server/obsidian/watcher");
  startVaultWatchers();

  const { startScheduler } = await import("@/server/tasks/scheduler");
  startScheduler();

  console.log("[bootstrap] Home Server ready.");
}

import cron, { type ScheduledTask } from "node-cron";
import { backupDatabase } from "./db";

// globalThis-backed for the same reason as tasks/scheduler.ts and
// vectorStore.ts: bootstrap() and any hot-reloaded module instance aren't
// guaranteed to share a module scope, and this must never register twice.
declare global {
  var __homeServerBackupJob: ScheduledTask | undefined;
}

const SCHEDULE = "0 3 * * *"; // 03:00 daily

export function startBackupSchedule() {
  if (globalThis.__homeServerBackupJob) return;
  globalThis.__homeServerBackupJob = cron.schedule(SCHEDULE, () => {
    try {
      const dest = backupDatabase();
      console.log(`[backup] database backed up to ${dest}`);
    } catch (err) {
      console.error("[backup] nightly backup failed:", err);
    }
  });
  console.log(`[backup] nightly DB backup scheduled (${SCHEDULE})`);
}

import cron, { type ScheduledTask } from "node-cron";
import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { tasks } from "@/server/db/schema";
import { runTask } from "./runner";

type SchedulerState = {
  cronJobs: Map<string, ScheduledTask>;
  fileWatchers: Map<string, FSWatcher>;
};

declare global {
  var __homeServerScheduler: SchedulerState | undefined;
}

// globalThis-backed for the same reason as vectorStore.ts/obsidian/watcher.ts:
// the tasks API routes (which call reconcile) and instrumentation's bootstrap
// (which calls startScheduler) aren't guaranteed to share a module instance.
function state(): SchedulerState {
  if (!globalThis.__homeServerScheduler) {
    globalThis.__homeServerScheduler = { cronJobs: new Map(), fileWatchers: new Map() };
  }
  return globalThis.__homeServerScheduler;
}

function unregister(taskId: string) {
  const s = state();
  const job = s.cronJobs.get(taskId);
  if (job) {
    job.stop();
    s.cronJobs.delete(taskId);
  }
  const watcher = s.fileWatchers.get(taskId);
  if (watcher) {
    watcher.close();
    s.fileWatchers.delete(taskId);
  }
}

function registerCron(task: typeof tasks.$inferSelect) {
  if (!task.cronExpression || !cron.validate(task.cronExpression)) {
    console.error(`[tasks] invalid cron expression for task ${task.id}: ${task.cronExpression}`);
    return;
  }
  const job = cron.schedule(task.cronExpression, () => {
    void runTask(task.id, { triggerSource: "cron" });
  });
  state().cronJobs.set(task.id, job);
}

function registerFileWatch(task: typeof tasks.$inferSelect) {
  if (!task.watchPath) return;
  const glob = task.watchGlob || "*";
  const watcher = chokidar.watch(".", {
    cwd: task.watchPath,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    ignored: (filePath, stats) => {
      if (!stats?.isFile()) return false;
      const base = path.basename(filePath);
      return !matchGlob(base, glob);
    },
  });

  watcher.on("add", (relativePath) => {
    void runTask(task.id, {
      triggerSource: "file_watch",
      changedFilePath: path.join(task.watchPath as string, relativePath),
    });
  });
  watcher.on("error", (err) => console.error(`[tasks] watcher error for task ${task.id}:`, err));

  state().fileWatchers.set(task.id, watcher);
}

function matchGlob(filename: string, glob: string): boolean {
  if (glob === "*") return true;
  const pattern = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${pattern}$`).test(filename);
}

export function reconcile(taskId: string) {
  unregister(taskId);
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task || !task.enabled) return;

  if (task.triggerType === "cron") registerCron(task);
  else if (task.triggerType === "file_watch") registerFileWatch(task);
}

export function startScheduler() {
  const enabledTasks = db.select().from(tasks).where(eq(tasks.enabled, true)).all();
  for (const task of enabledTasks) {
    if (task.triggerType === "cron") registerCron(task);
    else if (task.triggerType === "file_watch") registerFileWatch(task);
  }
  console.log(`[tasks] scheduler started (${enabledTasks.length} enabled tasks)`);
}

import cron, { type ScheduledTask } from "node-cron";
import chokidar, { type FSWatcher } from "chokidar";
import { CronExpressionParser } from "cron-parser";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { tasks, taskRuns } from "@/server/db/schema";
import { runTask } from "./runner";

type SchedulerState = {
  cronJobs: Map<string, ScheduledTask>;
  fileWatchers: Map<string, FSWatcher>;
  onceTimers: Map<string, NodeJS.Timeout>;
};

declare global {
  var __homeServerScheduler: SchedulerState | undefined;
}

// globalThis-backed for the same reason as vectorStore.ts/obsidian/watcher.ts:
// the tasks API routes (which call reconcile) and instrumentation's bootstrap
// (which calls startScheduler) aren't guaranteed to share a module instance.
function state(): SchedulerState {
  if (!globalThis.__homeServerScheduler) {
    globalThis.__homeServerScheduler = { cronJobs: new Map(), fileWatchers: new Map(), onceTimers: new Map() };
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
  const timer = s.onceTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    s.onceTimers.delete(taskId);
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

// setTimeout overflows (fires ~immediately, silently) past ~24.8 days — stay
// comfortably under that rather than risk a reminder set for "next month"
// firing today.
const MAX_SAFE_TIMEOUT_MS = 20 * 24 * 60 * 60 * 1000;

function registerOnce(task: typeof tasks.$inferSelect) {
  if (!task.runAt) return;
  const delayMs = task.runAt * 1000 - Date.now();

  const fire = () => {
    state().onceTimers.delete(task.id);
    void runTask(task.id, { triggerSource: "once" }).then(() => {
      // One-shot: disable so a later reconcile()/boot doesn't re-register it.
      db.update(tasks).set({ enabled: false }).where(eq(tasks.id, task.id)).run();
    });
  };

  if (delayMs <= 0) {
    fire(); // already due — e.g. catching up after being offline past the target time
    return;
  }
  if (delayMs > MAX_SAFE_TIMEOUT_MS) {
    console.error(`[tasks] task ${task.id} is scheduled more than 20 days out — not registered yet`);
    return;
  }
  state().onceTimers.set(task.id, setTimeout(fire, delayMs));
}

export function reconcile(taskId: string) {
  unregister(taskId);
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task || !task.enabled) return;

  if (task.triggerType === "cron") registerCron(task);
  else if (task.triggerType === "file_watch") registerFileWatch(task);
  else if (task.triggerType === "once") registerOnce(task);
}

// node-cron only fires while the process is actually running — a task
// scheduled for while the phone was asleep/off just silently never happens,
// with nothing to show for it beyond a stale "last success" on the Tasks
// page. This runs once at boot per enabled cron task: if the most recent
// scheduled slot (per its cron expression) is more recent than its last
// actual run, that slot was missed while the process was down — run it once
// now. Only ever catches up the single most recent missed slot, never
// backfills a whole string of them after a long outage.
function catchUpMissedCron(task: typeof tasks.$inferSelect) {
  if (!task.cronExpression || !cron.validate(task.cronExpression)) return;

  let lastScheduledFireMs: number;
  try {
    lastScheduledFireMs = CronExpressionParser.parse(task.cronExpression, {
      currentDate: new Date(),
    })
      .prev()
      .getTime();
  } catch {
    return; // unparseable — registerCron already logs this case
  }

  // Don't "catch up" a slot that occurred before the task even existed.
  if (lastScheduledFireMs < task.createdAt * 1000) return;

  const mostRecentRun = db
    .select({ startedAt: taskRuns.startedAt })
    .from(taskRuns)
    .where(eq(taskRuns.taskId, task.id))
    .orderBy(desc(taskRuns.startedAt))
    .limit(1)
    .get();
  if (mostRecentRun && mostRecentRun.startedAt * 1000 >= lastScheduledFireMs) return;

  console.log(`[tasks] catching up a missed cron fire for task ${task.id}`);
  void runTask(task.id, { triggerSource: "cron" });
}

export function startScheduler() {
  const enabledTasks = db.select().from(tasks).where(eq(tasks.enabled, true)).all();
  for (const task of enabledTasks) {
    if (task.triggerType === "cron") {
      registerCron(task);
      catchUpMissedCron(task);
    } else if (task.triggerType === "file_watch") registerFileWatch(task);
    else if (task.triggerType === "once") registerOnce(task);
  }
  console.log(`[tasks] scheduler started (${enabledTasks.length} enabled tasks)`);
}

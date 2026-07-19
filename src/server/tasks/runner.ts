import fs from "node:fs";
import { eq, and, desc, notInArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { tasks, taskRuns } from "@/server/db/schema";
import { backendFor } from "@/server/backends/registry";
import type { BackendKind } from "@/server/backends/types";
import { newId } from "@/server/util/hash";
import { notify } from "@/server/notify/termux";

const MAX_INJECTED_FILE_CHARS = 4000;
// A cron task firing every few minutes would otherwise grow this table
// forever — keep enough history to be useful (troubleshooting a flaky
// schedule, checking recent output) without it becoming unbounded.
const MAX_RUNS_PER_TASK = 50;

function pruneOldRuns(taskId: string) {
  const keepIds = db
    .select({ id: taskRuns.id })
    .from(taskRuns)
    .where(eq(taskRuns.taskId, taskId))
    .orderBy(desc(taskRuns.startedAt))
    .limit(MAX_RUNS_PER_TASK)
    .all()
    .map((r) => r.id);
  if (keepIds.length === 0) return;
  db.delete(taskRuns)
    .where(and(eq(taskRuns.taskId, taskId), notInArray(taskRuns.id, keepIds)))
    .run();
}

function renderFilename(template: string | null, taskName: string): string {
  const fallback = `task-${taskName}-${Date.now()}`;
  if (!template) return fallback;
  return template
    .replace(/\{taskName\}/g, taskName)
    .replace(/\{date\}/g, new Date().toISOString().slice(0, 10))
    .replace(/\{timestamp\}/g, String(Date.now()));
}

export async function runTask(
  taskId: string,
  ctx: { triggerSource: "manual" | "cron" | "file_watch" | "once"; changedFilePath?: string },
): Promise<typeof taskRuns.$inferSelect> {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new Error("Task not found");

  const runId = newId("run");
  db.insert(taskRuns)
    .values({ id: runId, taskId, status: "running", triggerSource: ctx.triggerSource })
    .run();

  try {
    let prompt = task.prompt;
    if (ctx.changedFilePath) {
      try {
        const content = fs.readFileSync(ctx.changedFilePath, "utf-8").slice(0, MAX_INJECTED_FILE_CHARS);
        prompt = `${prompt}\n\nChanged file (${ctx.changedFilePath}):\n\n${content}`;
      } catch {
        // Binary or unreadable file; run with the base prompt only.
      }
    }

    const backend = backendFor(task.backend as BackendKind);
    const output = await backend.chatComplete(task.modelId, [{ role: "user", content: prompt }]);

    if (task.saveToVault) {
      const { writeNote } = await import("@/server/obsidian/writer");
      await writeNote({
        filename: renderFilename(task.vaultFilenameTemplate, task.name),
        content: output,
        frontmatter: { created: new Date().toISOString(), source: `task:${task.name}` },
      });
    }

    db.update(taskRuns)
      .set({ status: "success", output, finishedAt: Date.now() / 1000 })
      .where(eq(taskRuns.id, runId))
      .run();

    // "once" tasks are the reminder use case — a reply sitting in a table
    // only you'd see by opening the Tasks page isn't a reminder. Not done
    // for cron/file_watch/manual: those are frequent/expected, a notification
    // per run would just be noise.
    if (ctx.triggerSource === "once") notify(`⏰ ${task.name}`, output || task.prompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(taskRuns)
      .set({ status: "error", error: message, finishedAt: Date.now() / 1000 })
      .where(eq(taskRuns.id, runId))
      .run();

    if (ctx.triggerSource === "once") notify(`⚠️ ${task.name} failed`, message);
  }

  pruneOldRuns(taskId);
  return db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get()!;
}

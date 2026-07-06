import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { tasks, taskRuns } from "@/server/db/schema";
import { backendFor } from "@/server/backends/registry";
import { newId } from "@/server/util/hash";

const MAX_INJECTED_FILE_CHARS = 4000;

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
  ctx: { triggerSource: "manual" | "cron" | "file_watch"; changedFilePath?: string },
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

    const backend = backendFor(task.backend as "ollama" | "llamacpp");
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
  } catch (err) {
    db.update(taskRuns)
      .set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: Date.now() / 1000,
      })
      .where(eq(taskRuns.id, runId))
      .run();
  }

  return db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get()!;
}

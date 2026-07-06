import { eq, desc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { tasks, taskRuns } from "@/server/db/schema";
import { newId } from "@/server/util/hash";
import { reconcile } from "./scheduler";

export type TaskInput = {
  name: string;
  prompt: string;
  backend: "ollama" | "llamacpp";
  modelId: string;
  triggerType: "manual" | "cron" | "file_watch";
  cronExpression?: string | null;
  watchPath?: string | null;
  watchGlob?: string | null;
  saveToVault?: boolean;
  vaultFilenameTemplate?: string | null;
  enabled?: boolean;
};

export function listTasks() {
  return db.select().from(tasks).orderBy(desc(tasks.createdAt)).all();
}

export function getTask(id: string) {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

export function createTask(input: TaskInput) {
  const id = newId("task");
  db.insert(tasks)
    .values({
      id,
      name: input.name,
      prompt: input.prompt,
      backend: input.backend,
      modelId: input.modelId,
      triggerType: input.triggerType,
      cronExpression: input.cronExpression ?? null,
      watchPath: input.watchPath ?? null,
      watchGlob: input.watchGlob ?? null,
      saveToVault: input.saveToVault ?? false,
      vaultFilenameTemplate: input.vaultFilenameTemplate ?? null,
      enabled: input.enabled ?? true,
    })
    .run();
  reconcile(id);
  return getTask(id)!;
}

export function updateTask(id: string, patch: Partial<TaskInput>) {
  db.update(tasks)
    .set({ ...patch, updatedAt: Date.now() / 1000 })
    .where(eq(tasks.id, id))
    .run();
  reconcile(id);
  return getTask(id);
}

export function deleteTask(id: string) {
  db.delete(tasks).where(eq(tasks.id, id)).run();
  reconcile(id); // task row is gone, so this just unregisters any active job/watcher
}

export function listTaskRuns(taskId: string) {
  return db
    .select()
    .from(taskRuns)
    .where(eq(taskRuns.taskId, taskId))
    .orderBy(desc(taskRuns.startedAt))
    .all();
}

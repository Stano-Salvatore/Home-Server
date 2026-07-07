import { eq, desc, and } from "drizzle-orm";
import { db } from "@/server/db/client";
import { projects, conversations, brainDocuments } from "@/server/db/schema";
import { newId } from "@/server/util/hash";

export function listProjects() {
  return db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
}

export function getProject(id: string) {
  return db.select().from(projects).where(eq(projects.id, id)).get();
}

export function createProject(opts: { name: string; emoji?: string; instructions?: string }) {
  const id = newId("proj");
  db.insert(projects)
    .values({
      id,
      name: opts.name.trim() || "Untitled Project",
      emoji: opts.emoji?.trim() || null,
      instructions: opts.instructions ?? null,
    })
    .run();
  return getProject(id)!;
}

export function updateProject(
  id: string,
  patch: Partial<{ name: string; emoji: string | null; instructions: string | null }>,
) {
  db.update(projects)
    .set({ ...patch, updatedAt: Date.now() / 1000 })
    .where(eq(projects.id, id))
    .run();
  return getProject(id);
}

export function deleteProject(id: string) {
  // Conversations detach (project_id -> null, keeping the chats); the project's
  // isolated memory documents cascade away with the project.
  db.delete(projects).where(eq(projects.id, id)).run();
}

export function projectConversations(projectId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, projectId))
    .orderBy(desc(conversations.updatedAt))
    .all();
}

export function projectMemoryCount(projectId: string) {
  const rows = db
    .select({ id: brainDocuments.id })
    .from(brainDocuments)
    .where(and(eq(brainDocuments.projectId, projectId), eq(brainDocuments.sourceType, "chat")))
    .all();
  return rows.length;
}

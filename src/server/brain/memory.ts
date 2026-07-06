import { eq, desc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { memoryFacts } from "@/server/db/schema";
import { newId } from "@/server/util/hash";

export function listMemoryFacts() {
  return db.select().from(memoryFacts).orderBy(desc(memoryFacts.updatedAt)).all();
}

export function createMemoryFact(opts: { content: string; category?: string; source?: string }) {
  const id = newId("mem");
  db.insert(memoryFacts)
    .values({
      id,
      content: opts.content,
      category: opts.category ?? null,
      source: opts.source ?? "manual",
    })
    .run();
  return db.select().from(memoryFacts).where(eq(memoryFacts.id, id)).get();
}

export function updateMemoryFact(id: string, patch: { content?: string; category?: string }) {
  db.update(memoryFacts)
    .set({ ...patch, updatedAt: Date.now() / 1000 })
    .where(eq(memoryFacts.id, id))
    .run();
  return db.select().from(memoryFacts).where(eq(memoryFacts.id, id)).get();
}

export function deleteMemoryFact(id: string) {
  db.delete(memoryFacts).where(eq(memoryFacts.id, id)).run();
}

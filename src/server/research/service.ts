import { eq, desc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { researchRuns } from "@/server/db/schema";
import { backendFor } from "@/server/backends/registry";
import type { ChatMessage } from "@/server/backends/types";
import { newId } from "@/server/util/hash";

// Deep Research, Odysseus-style: multi-round gather → read → synthesize jobs
// that run in the background and produce a markdown report. Sources per
// round: the configured web search provider, Wikipedia (online or Kiwix,
// whatever Settings say), and the user's own Brain (hybrid retrieval) — so
// on a fully offline fleet it still works from Brain + Kiwix alone.

export type ResearchMode = "auto" | "product" | "compare" | "howto" | "factcheck";

const MODE_BRIEFS: Record<ResearchMode, string> = {
  auto: "Write a clear, well-structured report that answers the question thoroughly.",
  product:
    "Write a product research report: what it is, key specs/features, price/availability if known, strengths, weaknesses, and who it's for.",
  compare:
    "Write a comparison report: a criteria-by-criteria comparison of the options, a summary table, and a final recommendation with reasoning.",
  howto:
    "Write a step-by-step how-to guide: prerequisites, numbered steps, pitfalls to avoid, and how to verify success.",
  factcheck:
    "Write a fact-check report: state the claim, the verdict (true/false/mixed/unverifiable), and weigh the evidence for and against, noting source reliability.",
};

type Source = { title: string; ref: string; content: string; origin: "web" | "wikipedia" | "brain" };

declare global {
  // Cooperative cancellation flags for in-flight runs (see vectorStore.ts for
  // why globalThis instead of a module-level variable).
  var __homeServerResearchCancels: Set<string> | undefined;
}

function cancels(): Set<string> {
  if (!globalThis.__homeServerResearchCancels) globalThis.__homeServerResearchCancels = new Set();
  return globalThis.__homeServerResearchCancels;
}

export function listRuns(limit = 30) {
  return db.select().from(researchRuns).orderBy(desc(researchRuns.createdAt)).limit(limit).all();
}

export function getRun(id: string) {
  return db.select().from(researchRuns).where(eq(researchRuns.id, id)).get();
}

export function deleteRun(id: string) {
  cancels().add(id); // if it's somehow still running, let it die quietly
  db.delete(researchRuns).where(eq(researchRuns.id, id)).run();
}

export function cancelRun(id: string) {
  cancels().add(id);
  db.update(researchRuns)
    .set({ status: "cancelled", statusText: "cancelled", finishedAt: Date.now() / 1000 })
    .where(eq(researchRuns.id, id))
    .run();
}

function progress(id: string, patch: Partial<typeof researchRuns.$inferInsert>) {
  db.update(researchRuns).set(patch).where(eq(researchRuns.id, id)).run();
}

function cancelled(id: string): boolean {
  return cancels().has(id);
}

// Models — especially small local ones — love wrapping JSON in fences or
// prose. Pull the first JSON array of strings out of wherever it landed.
function parseQueryList(text: string, fallback: string): string[] {
  try {
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        const qs = arr.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
        if (qs.length > 0) return qs.slice(0, 4);
      }
    }
  } catch {
    // fall through
  }
  return [fallback];
}

async function ask(backend: string, modelId: string, system: string, user: string): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  return backendFor(backend as "ollama" | "llamacpp" | "litertlm").chatComplete(modelId, messages);
}

async function gatherSources(query: string): Promise<Source[]> {
  const out: Source[] = [];
  const [web, wiki, brain] = await Promise.allSettled([
    import("@/server/search/websearch").then((m) => m.webSearch(query, 4)),
    import("@/server/wikipedia/wikipedia").then((m) => m.wikipediaSearch(query)),
    import("@/server/brain/search").then(async (m) => {
      const { knowledgeFilter } = await import("@/server/brain/chatMemory");
      return m.searchBrain(query, 4, { filter: knowledgeFilter(null) });
    }),
  ]);

  if (web.status === "fulfilled") {
    for (const h of web.value) {
      out.push({ title: h.title, ref: h.url, content: h.snippet, origin: "web" });
    }
  }
  if (wiki.status === "fulfilled") {
    for (const h of wiki.value) {
      out.push({ title: `Wikipedia (${h.lang}): ${h.title}`, ref: h.url, content: h.extract, origin: "wikipedia" });
    }
  }
  if (brain.status === "fulfilled") {
    for (const h of brain.value) {
      out.push({ title: `Your notes: ${h.title}`, ref: h.sourcePath, content: h.content, origin: "brain" });
    }
  }
  return out;
}

// Web snippets are thin; fetch full text for the couple of most promising
// pages per round so synthesis has something to chew on.
async function deepenTopWebSources(sources: Source[], max = 2) {
  const { fetchPageText } = await import("@/server/search/websearch");
  let fetched = 0;
  for (const s of sources) {
    if (fetched >= max) break;
    if (s.origin !== "web") continue;
    const text = await fetchPageText(s.ref);
    if (text && text.length > s.content.length) {
      s.content = text;
      fetched++;
    }
  }
}

function sourcesBlock(sources: Source[]): string {
  return sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.ref})\n${s.content}`)
    .join("\n\n---\n\n");
}

async function runResearch(id: string) {
  const run = getRun(id);
  if (!run) return;
  const mode = (run.mode as ResearchMode) ?? "auto";
  const brief = MODE_BRIEFS[mode] ?? MODE_BRIEFS.auto;
  const allSources: Source[] = [];
  const notes: string[] = [];

  try {
    progress(id, { statusText: "planning research strategy" });
    const planRaw = await ask(
      run.backend,
      run.modelId,
      `You plan research. Reply with ONLY a JSON array of 2-4 short, distinct web-search queries (strings) that together answer the user's request. No prose.`,
      run.prompt,
    );
    if (cancelled(id)) return;
    let queries = parseQueryList(planRaw, run.prompt);

    for (let round = 1; round <= run.rounds; round++) {
      progress(id, { round, statusText: `searching: ${queries[0] ?? run.prompt}` });

      const roundSources: Source[] = [];
      for (const q of queries) {
        if (cancelled(id)) return;
        progress(id, { statusText: `searching: ${q}` });
        roundSources.push(...(await gatherSources(q)));
      }
      // De-dupe by ref across the whole run.
      const seen = new Set(allSources.map((s) => s.ref));
      const fresh = roundSources.filter((s) => (seen.has(s.ref) ? false : (seen.add(s.ref), true)));

      progress(id, { statusText: "reading sources" });
      await deepenTopWebSources(fresh);
      allSources.push(...fresh);
      progress(id, { sourcesCount: allSources.length, statusText: `synthesizing round ${round}` });

      if (cancelled(id)) return;
      const synthesis = await ask(
        run.backend,
        run.modelId,
        `You are a research assistant taking notes. From the sources below, extract every fact relevant to the research question, with the source number after each fact like [3]. Be dense and factual; flag contradictions between sources. If the sources are empty or irrelevant, say so plainly.`,
        `Research question: ${run.prompt}\n\nSources:\n\n${fresh.length > 0 ? sourcesBlock(fresh) : "(no new sources found this round)"}`,
      );
      notes.push(`## Round ${round} notes\n\n${synthesis}`);

      if (round < run.rounds) {
        if (cancelled(id)) return;
        progress(id, { statusText: "planning next round" });
        const followRaw = await ask(
          run.backend,
          run.modelId,
          `You plan follow-up research. Given the notes so far, reply with ONLY a JSON array of 1-3 short web-search queries covering the biggest remaining gaps. No prose.`,
          `Research question: ${run.prompt}\n\nNotes so far:\n\n${notes.join("\n\n")}`,
        );
        queries = parseQueryList(followRaw, run.prompt);
      }
    }

    if (cancelled(id)) return;
    progress(id, { statusText: "writing report" });
    const refList = allSources.map((s, i) => `[${i + 1}] ${s.title} — ${s.ref}`).join("\n");
    const report = await ask(
      run.backend,
      run.modelId,
      `You write research reports in clean markdown. ${brief} Use ## section headings, keep citations like [3] pointing at the numbered source list, and end with a "## Sources" section listing them. Ground every claim in the notes — never invent sources or facts. If the notes are thin, say what couldn't be established.`,
      `Research question: ${run.prompt}\n\nResearch notes:\n\n${notes.join("\n\n")}\n\nNumbered sources:\n${refList || "(none found)"}`,
    );
    if (cancelled(id)) return;

    progress(id, {
      status: "done",
      statusText: "done",
      report,
      sourcesCount: allSources.length,
      finishedAt: Date.now() / 1000,
    });
  } catch (err) {
    if (cancelled(id)) return;
    progress(id, {
      status: "error",
      statusText: "failed",
      error: err instanceof Error ? err.message : String(err),
      finishedAt: Date.now() / 1000,
    });
  } finally {
    cancels().delete(id);
  }
}

export function startResearch(opts: {
  prompt: string;
  mode: ResearchMode;
  backend: string;
  modelId: string;
  rounds: number;
}) {
  const id = newId("research");
  db.insert(researchRuns)
    .values({
      id,
      prompt: opts.prompt,
      mode: opts.mode,
      backend: opts.backend,
      modelId: opts.modelId,
      rounds: Math.min(Math.max(opts.rounds, 1), 4),
      status: "running",
      statusText: "queued",
    })
    .run();
  // Fire and forget — progress lands in the DB row; the UI polls it.
  void runResearch(id);
  return getRun(id)!;
}

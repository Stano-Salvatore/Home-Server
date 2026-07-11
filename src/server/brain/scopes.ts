import { like, or } from "drizzle-orm";
import { getSetting, setSetting } from "@/server/settings/config";
import { db } from "@/server/db/client";
import { brainDocuments } from "@/server/db/schema";

// A "scope" is a custom Brain node (from customNodes) with a set of member
// documents. Pinning a conversation/agent to a scope limits retrieval to those
// documents — e.g. a "library" node that only searches your books.
//
// Membership is stored as { [scopeId]: docId[] } so a document can belong to
// several scopes at once.
type Membership = Record<string, string[]>;

const KEY = "brain_scope_members";

function load(): Membership {
  const raw = getSetting(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Membership;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(m: Membership) {
  setSetting(KEY, JSON.stringify(m));
}

export function getScopeMembers(scopeId: string): string[] {
  return load()[scopeId] ?? [];
}

export function getAllScopeMembers(): Membership {
  return load();
}

export function getDocScopes(docId: string): string[] {
  const m = load();
  return Object.keys(m).filter((scopeId) => m[scopeId].includes(docId));
}

/** Set exactly which scopes a document belongs to. */
export function setDocScopes(docId: string, scopeIds: string[]) {
  const m = load();
  const want = new Set(scopeIds);
  // Remove the doc from scopes it's no longer in.
  for (const scopeId of Object.keys(m)) {
    if (!want.has(scopeId)) m[scopeId] = m[scopeId].filter((d) => d !== docId);
  }
  // Add it to the requested scopes.
  for (const scopeId of scopeIds) {
    if (!m[scopeId]) m[scopeId] = [];
    if (!m[scopeId].includes(docId)) m[scopeId].push(docId);
  }
  save(m);
}

/**
 * There is no UI for adding documents to a scope one at a time — for a vault
 * with hundreds of notes that's unusable. This adds every document whose
 * title or folder path contains `pathPrefix` (e.g. the scope's own label,
 * "Books", or a narrower "Egon Bondy") to the scope in one call, merging
 * with whatever scopes each doc already belongs to. Returns how many matched.
 */
export function bulkAssignScope(scopeId: string, pathPrefix: string): number {
  // Mobile keyboards love appending a trailing "." on autocorrect/autocap —
  // a literal period in the LIKE pattern then fails to match "Books/Egon
  // Bondy/..." (there's no "." there), silently matching zero documents.
  const cleaned = pathPrefix.trim().replace(/^[.,!?;:]+|[.,!?;:]+$/g, "").trim();
  if (!cleaned) return 0;
  const needle = `%${cleaned}%`;
  const rows = db
    .select({ id: brainDocuments.id })
    .from(brainDocuments)
    .where(or(like(brainDocuments.title, needle), like(brainDocuments.sourcePath, needle)))
    .all();

  const m = load();
  if (!m[scopeId]) m[scopeId] = [];
  const existing = new Set(m[scopeId]);
  for (const row of rows) existing.add(row.id);
  m[scopeId] = [...existing];
  save(m);
  return rows.length;
}

/** Drop a scope's membership entirely (called when a scope node is deleted). */
export function removeScope(scopeId: string) {
  const m = load();
  if (m[scopeId]) {
    delete m[scopeId];
    save(m);
  }
}

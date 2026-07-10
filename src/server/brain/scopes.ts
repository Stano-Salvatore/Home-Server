import { getSetting, setSetting } from "@/server/settings/config";

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

/** Drop a scope's membership entirely (called when a scope node is deleted). */
export function removeScope(scopeId: string) {
  const m = load();
  if (m[scopeId]) {
    delete m[scopeId];
    save(m);
  }
}

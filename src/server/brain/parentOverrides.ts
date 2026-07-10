import { getSetting, setSetting } from "@/server/settings/config";

// User overrides for which node an auto-derived node (a document or folder)
// connects to in the Brain graph. By default docs hang off the hub (or a folder
// tree); this lets you move them onto, say, a "library" node instead.
type Overrides = Record<string, string>;

const KEY = "brain_parent_overrides";

export function getParentOverrides(): Overrides {
  const raw = getSetting(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Overrides;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function setParentOverride(nodeId: string, parentId: string | null) {
  const o = getParentOverrides();
  if (!parentId) delete o[nodeId];
  else o[nodeId] = parentId;
  setSetting(KEY, JSON.stringify(o));
}

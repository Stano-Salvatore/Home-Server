import { readJsonBlob, writeJsonBlob, isPlainObject } from "@/server/settings/jsonBlob";

// User overrides for which node an auto-derived node (a document or folder)
// connects to in the Brain graph. By default docs hang off the hub (or a folder
// tree); this lets you move them onto, say, a "library" node instead.
type Overrides = Record<string, string>;

const KEY = "brain_parent_overrides";

export function getParentOverrides(): Overrides {
  return readJsonBlob<Overrides>(KEY, {}, isPlainObject as (v: unknown) => v is Overrides);
}

export function setParentOverride(nodeId: string, parentId: string | null) {
  const o = getParentOverrides();
  if (!parentId) delete o[nodeId];
  else o[nodeId] = parentId;
  writeJsonBlob(KEY, o);
}

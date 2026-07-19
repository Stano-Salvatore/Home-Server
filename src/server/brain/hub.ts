import { readJsonBlob, writeJsonBlob, isPlainObject } from "@/server/settings/jsonBlob";

// The central node of the Brain graph. Editable so you can name it "library",
// recolour it, etc.
export type Hub = { label: string; emoji: string; color: string };

const KEY = "brain_hub";
const DEFAULT: Hub = { label: "brain", emoji: "🧠", color: "#e06c75" };

export function getHub(): Hub {
  // Merge-with-defaults, not a strict fallback — an older/partial stored
  // value (missing a field added later) still yields a complete Hub instead
  // of being discarded wholesale.
  const p = readJsonBlob<Partial<Hub>>(KEY, {}, isPlainObject as (v: unknown) => v is Partial<Hub>);
  return { label: p.label ?? DEFAULT.label, emoji: p.emoji ?? DEFAULT.emoji, color: p.color ?? DEFAULT.color };
}

export function updateHub(patch: Partial<Hub>): Hub {
  const cur = getHub();
  const next: Hub = {
    label: patch.label !== undefined ? patch.label.trim() || cur.label : cur.label,
    emoji: patch.emoji !== undefined ? patch.emoji : cur.emoji,
    color: patch.color !== undefined ? patch.color : cur.color,
  };
  writeJsonBlob(KEY, next);
  return next;
}

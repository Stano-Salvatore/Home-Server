import { getSetting, setSetting } from "@/server/settings/config";

// The central node of the Brain graph. Editable so you can name it "library",
// recolour it, etc.
export type Hub = { label: string; emoji: string; color: string };

const KEY = "brain_hub";
const DEFAULT: Hub = { label: "brain", emoji: "🧠", color: "#e06c75" };

export function getHub(): Hub {
  const raw = getSetting(KEY);
  if (!raw) return DEFAULT;
  try {
    const p = JSON.parse(raw) as Partial<Hub>;
    return { label: p.label ?? DEFAULT.label, emoji: p.emoji ?? DEFAULT.emoji, color: p.color ?? DEFAULT.color };
  } catch {
    return DEFAULT;
  }
}

export function updateHub(patch: Partial<Hub>): Hub {
  const cur = getHub();
  const next: Hub = {
    label: patch.label !== undefined ? patch.label.trim() || cur.label : cur.label,
    emoji: patch.emoji !== undefined ? patch.emoji : cur.emoji,
    color: patch.color !== undefined ? patch.color : cur.color,
  };
  setSetting(KEY, JSON.stringify(next));
  return next;
}

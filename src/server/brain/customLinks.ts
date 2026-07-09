import { getSetting, setSetting } from "@/server/settings/config";
import { newId } from "@/server/util/hash";

// User-drawn connections between any two nodes in the Brain graph (agent↔note,
// note↔note, custom↔anything). Separate from the auto-derived folder edges.
export type CustomLink = { id: string; a: string; b: string };

const KEY = "brain_custom_links";

export function listCustomLinks(): CustomLink[] {
  const raw = getSetting(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CustomLink[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(links: CustomLink[]) {
  setSetting(KEY, JSON.stringify(links));
}

export function addCustomLink(a: string, b: string): CustomLink | null {
  if (!a || !b || a === b) return null;
  const links = listCustomLinks();
  // Don't add a duplicate (in either direction).
  if (links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return null;
  const link: CustomLink = { id: newId("link"), a, b };
  save([...links, link]);
  return link;
}

export function deleteCustomLink(id: string) {
  save(listCustomLinks().filter((l) => l.id !== id));
}

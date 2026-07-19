import { getSetting, setSetting } from "./config";

// A recurring storage idiom across this app: small collections/objects live
// as JSON blobs in the settings KV table (nodes, vaults, custom nodes/links,
// scope membership, parent overrides, the hub, agents) — every one of those
// modules used to hand-roll the same read/JSON.parse/validate/fallback and
// write/JSON.stringify pair. Module-specific behavior (seeding from a legacy
// setting, partial-merge-with-defaults) stays in the module; this only pulls
// out the mechanical part.

/** Reads a JSON-encoded value from Settings, defensively: a missing key,
 *  corrupt JSON, or a parsed value that fails `isValid` all fall back to
 *  `fallback` rather than throwing. */
export function readJsonBlob<T>(key: string, fallback: T, isValid: (v: unknown) => v is T): T {
  const raw = getSetting(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonBlob<T>(key: string, value: T): void {
  setSetting(key, JSON.stringify(value));
}

export function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

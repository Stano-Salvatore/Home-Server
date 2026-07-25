import { getSetting, loadSettings } from "@/server/settings/config";
import { writeJsonBlob } from "@/server/settings/jsonBlob";
import { newId } from "@/server/util/hash";

export type Vault = { id: string; name: string; path: string };

const VAULTS_KEY = "obsidian_vaults";

// Not routed through readJsonBlob like the other collection modules: on a
// missing/corrupt/invalid stored value this needs to fall through to
// seeding from the legacy vaultPath setting (and persist that seed), not
// just return an empty fallback — a genuinely different (seed-and-write)
// shape from a plain read-with-fallback.
export function listVaults(): Vault[] {
  const raw = getSetting(VAULTS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Vault[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  const legacy = loadSettings().vaultPath;
  if (legacy) {
    const seeded: Vault[] = [{ id: newId("vault"), name: "Vault", path: legacy }];
    writeJsonBlob(VAULTS_KEY, seeded);
    return seeded;
  }
  return [];
}

function saveVaults(vaults: Vault[]) {
  writeJsonBlob(VAULTS_KEY, vaults);
}

export function addVault(name: string, path: string): Vault {
  const vault: Vault = { id: newId("vault"), name: name.trim() || "Vault", path: path.trim() };
  saveVaults([...listVaults(), vault]);
  return vault;
}

export function deleteVault(id: string) {
  saveVaults(listVaults().filter((v) => v.id !== id));
}

export function vaultPaths(): string[] {
  return listVaults()
    .map((v) => v.path)
    .filter(Boolean);
}

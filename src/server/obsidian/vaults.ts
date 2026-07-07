import { getSetting, setSetting, loadSettings } from "@/server/settings/config";
import { newId } from "@/server/util/hash";

export type Vault = { id: string; name: string; path: string };

const VAULTS_KEY = "obsidian_vaults";

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
  // Seed from the legacy single vaultPath setting so upgrades keep working.
  const legacy = loadSettings().vaultPath;
  if (legacy) {
    const seeded: Vault[] = [{ id: newId("vault"), name: "Vault", path: legacy }];
    setSetting(VAULTS_KEY, JSON.stringify(seeded));
    return seeded;
  }
  return [];
}

function saveVaults(vaults: Vault[]) {
  setSetting(VAULTS_KEY, JSON.stringify(vaults));
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

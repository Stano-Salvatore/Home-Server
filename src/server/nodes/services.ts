import { loadSettings } from "@/server/settings/config";

export type ServiceStatus = { name: string; kind: string; url: string; online: boolean };

async function ping(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Non-inference boxes in the cluster (Kiwix / Qdrant), derived from settings
 *  so they show up alongside the Ollama nodes for a full picture of what's
 *  up — shared by the /api/nodes route and the built-in service_health tool. */
export async function probeServices(): Promise<ServiceStatus[]> {
  const s = loadSettings();
  const services: { name: string; kind: string; url: string; check: string }[] = [];

  s.kiwixUrl
    .split(",")
    .map((u) => u.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .forEach((url, i, arr) => {
      services.push({
        name: arr.length > 1 ? `Kiwix ${i + 1}` : "Kiwix",
        kind: "offline Wikipedia",
        url,
        check: `${url}/catalog/v2/entries`,
      });
    });

  if (s.qdrantUrl.trim()) {
    const url = s.qdrantUrl.trim().replace(/\/$/, "");
    services.push({ name: "Qdrant", kind: "vector store", url, check: `${url}/healthz` });
  }

  return Promise.all(
    services.map(async (svc) => ({
      name: svc.name,
      kind: svc.kind,
      url: svc.url,
      online: await ping(svc.check),
    })),
  );
}

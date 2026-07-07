import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";

const AppConfigSchema = z.object({
  vaultPath: z.string().default(""),
  libraryPath: z.string().default(path.join(process.cwd(), "data", "library")),
  uploadsPath: z.string().default(path.join(process.cwd(), "data", "uploads")),
  llamaCppBinPath: z.string().default("llama-server"),
  ollamaHost: z.string().default("http://127.0.0.1:11434"),
  embeddingModel: z.string().default("nomic-embed-text"),
  // Wikipedia grounding: "online" hits the live MediaWiki API, "kiwix" hits a
  // local kiwix-serve (offline). Langs are comma-separated wiki codes.
  wikipediaProvider: z.string().default("online"),
  kiwixUrl: z.string().default(""),
  wikipediaLangs: z.string().default("en,cs"),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

const ENV_DEFAULTS: Record<keyof AppConfig, string | undefined> = {
  vaultPath: process.env.VAULT_PATH,
  libraryPath: process.env.LIBRARY_PATH,
  uploadsPath: process.env.UPLOADS_PATH,
  llamaCppBinPath: process.env.LLAMACPP_BIN_PATH,
  ollamaHost: process.env.OLLAMA_HOST,
  embeddingModel: process.env.EMBEDDING_MODEL,
  wikipediaProvider: process.env.WIKIPEDIA_PROVIDER,
  kiwixUrl: process.env.KIWIX_URL,
  wikipediaLangs: process.env.WIKIPEDIA_LANGS,
};

function getRaw(key: string): string | undefined {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

export function getSetting(key: string): string | undefined {
  return getRaw(key);
}

export function setSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

let cachedConfig: AppConfig | null = null;

export function loadSettings(forceReload = false): AppConfig {
  if (cachedConfig && !forceReload) return cachedConfig;

  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(AppConfigSchema.shape) as (keyof AppConfig)[]) {
    const stored = getRaw(key);
    if (stored !== undefined) {
      raw[key] = stored;
    } else {
      const envDefault = ENV_DEFAULTS[key];
      if (envDefault !== undefined) {
        setSetting(key, envDefault);
        raw[key] = envDefault;
      }
    }
  }

  cachedConfig = AppConfigSchema.parse(raw);
  return cachedConfig;
}

export function updateSettings(patch: Partial<AppConfig>): AppConfig {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) setSetting(key, String(value));
  }
  return loadSettings(true);
}

export function pathStatus(p: string): { exists: boolean; writable: boolean } {
  if (!p) return { exists: false, writable: false };
  try {
    const stat = fs.statSync(p);
    if (!stat.isDirectory()) return { exists: false, writable: false };
    fs.accessSync(p, fs.constants.W_OK | fs.constants.R_OK);
    return { exists: true, writable: true };
  } catch {
    return { exists: false, writable: false };
  }
}

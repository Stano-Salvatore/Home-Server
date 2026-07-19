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
  // Set this when llama.cpp was built with a GPU backend that needs an
  // explicit driver override to actually get used — e.g. Vulkan on Android,
  // where the system's default loader silently falls back to a proprietary
  // driver that crashes on LLM shaders unless VK_ICD_FILENAMES points at the
  // Turnip ICD JSON (see bin/install-vulkan-llama). Blank = don't override.
  llamaCppEnv: z.string().default(""),
  ollamaHost: z.string().default("http://127.0.0.1:11434"),
  // litert-lm serve's OpenAI-compatible endpoint. Deliberately 127.0.0.1, not
  // 0.0.0.0 — binding wider would expose an unauthenticated LLM endpoint on
  // every network interface. Model id must match whatever `litert-lm import`
  // named it (see the litert-lm backend module for the full launch story).
  litertlmBaseUrl: z.string().default("http://127.0.0.1:9379"),
  litertlmModelId: z.string().default("gemma4-e2b"),
  // bge-m3 is multilingual (EN/CS/SK and more) and embeds Czech notes far
  // better than the English-centric nomic-embed-text default used to.
  embeddingModel: z.string().default("bge-m3"),
  // Where embeddings run. Blank = the default chat node. Set this to a separate
  // Ollama (e.g. the dashboard phone's own localhost) to keep the embedding
  // model off the compute node so it doesn't fight the chat model for RAM.
  embeddingHost: z.string().default(""),
  // Optional Qdrant vector DB. Blank = keep the vector index in this process's
  // RAM (fine for notes; won't scale to gigabytes on a phone). Set to a Qdrant
  // URL (e.g. the Lenovo services box) to hold vectors off-device instead.
  qdrantUrl: z.string().default(""),
  qdrantCollection: z.string().default("home_server"),
  // Wikipedia grounding: "online" hits the live MediaWiki API, "kiwix" hits a
  // local kiwix-serve (offline). Langs are comma-separated wiki codes.
  wikipediaProvider: z.string().default("online"),
  kiwixUrl: z.string().default(""),
  wikipediaLangs: z.string().default("en,cs"),
  // Web search grounding: "duckduckgo" works with zero setup; "searxng"
  // keeps the whole pipeline self-hosted (set searxngUrl); "brave" needs an
  // API key; "disabled" turns the Web toggle into a no-op.
  webSearchProvider: z.string().default("duckduckgo"),
  searxngUrl: z.string().default(""),
  braveApiKey: z.string().default(""),
  // Home Assistant REST API — a long-lived access token from HA's own
  // profile page (Settings → your profile → Long-Lived Access Tokens).
  // Blank url or token = the home_assistant_* tools just don't appear in
  // any tool-calling turn, same degrade-quietly pattern as every other
  // optional integration here.
  homeAssistantUrl: z.string().default(""),
  homeAssistantToken: z.string().default(""),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

const ENV_DEFAULTS: Record<keyof AppConfig, string | undefined> = {
  vaultPath: process.env.VAULT_PATH,
  libraryPath: process.env.LIBRARY_PATH,
  uploadsPath: process.env.UPLOADS_PATH,
  llamaCppBinPath: process.env.LLAMACPP_BIN_PATH,
  llamaCppEnv: process.env.LLAMACPP_ENV,
  ollamaHost: process.env.OLLAMA_HOST,
  litertlmBaseUrl: process.env.LITERTLM_BASE_URL,
  litertlmModelId: process.env.LITERTLM_MODEL_ID,
  embeddingModel: process.env.EMBEDDING_MODEL,
  embeddingHost: process.env.EMBEDDING_HOST,
  qdrantUrl: process.env.QDRANT_URL,
  qdrantCollection: process.env.QDRANT_COLLECTION,
  wikipediaProvider: process.env.WIKIPEDIA_PROVIDER,
  kiwixUrl: process.env.KIWIX_URL,
  wikipediaLangs: process.env.WIKIPEDIA_LANGS,
  webSearchProvider: process.env.WEB_SEARCH_PROVIDER,
  searxngUrl: process.env.SEARXNG_URL,
  braveApiKey: process.env.BRAVE_API_KEY,
  homeAssistantUrl: process.env.HOME_ASSISTANT_URL,
  homeAssistantToken: process.env.HOME_ASSISTANT_TOKEN,
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

const EMBEDDING_MIGRATION_KEY = "embedding_model_bge_m3_v1";

/** One-time: move installs still on the old nomic-embed-text default onto the
 *  multilingual bge-m3 model, which embeds Czech/Slovak notes far better.
 *  Leaves installs alone where the user already picked something else. Only
 *  flips the setting — existing chunks still need a Brain reindex to actually
 *  get re-embedded, since old vectors stay valid until then. */
export function migrateEmbeddingDefault() {
  if (getRaw(EMBEDDING_MIGRATION_KEY)) return;
  const current = getRaw("embeddingModel");
  if (current === undefined || current === "nomic-embed-text") {
    setSetting("embeddingModel", "bge-m3");
    cachedConfig = null;
  }
  setSetting(EMBEDDING_MIGRATION_KEY, "1");
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

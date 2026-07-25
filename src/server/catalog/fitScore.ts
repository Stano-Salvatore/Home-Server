import modelsJson from "./models.json";
import type { HardwareInfo } from "@/server/hardware/scan";

export type ModelArch = "dense" | "mamba-hybrid";

export type CatalogModel = {
  id: string;
  family: string;
  paramsB: number;
  quant: string;
  fileSizeGB: number;
  minRamGB: number;
  minVramGB: number;
  recommendedVramGB: number;
  contextLength: number;
  ollamaTag: string;
  // Optional; defaults to "dense". Hybrid Mamba-Transformer models (e.g. Nemotron
  // Nano) have a very different speed/memory profile and shouldn't be scored with
  // the dense-transformer speed curve.
  arch?: ModelArch;
};

export const CATALOG_MODELS = modelsJson as CatalogModel[];

export type FitLabel = "PERFECT" | "GOOD" | "TIGHT" | "WON'T FIT";

export type FitResult = {
  modelId: string;
  mode: "gpu" | "cpu";
  ratio: number;
  score: number;
  label: FitLabel;
  estTokPerSec: number;
  // Estimated KV-cache size (GB) at the model's *full* advertised context — an
  // informational ceiling, so a big-context model shows what maxing context costs.
  kvCacheGB: number;
};

// --- KV-cache sizing ------------------------------------------------------
//
// The catalog's minVram/recommendedVram figures were hand-set assuming a modest
// (~8K) context, so scoring adds only the *incremental* cost of a longer context
// on top of that baseline — existing 8K entries are unaffected, while a
// long-context model correctly shows a higher memory requirement.
//
// The coefficient is a rough per-billion-params, per-1K-tokens estimate for a
// modern GQA transformer at fp16 (~0.015 GB). Real usage varies a lot with layer
// count, GQA ratio, and tricks like sliding-window attention (Gemma 3), so treat
// this as guidance, not an exact reservation.
const KV_GB_PER_B_PER_1K_FP16 = 0.015;
const KV_BASELINE_TOKENS = 8192;

// Score fit at up to this much context — a realistic working size. Models that
// advertise more still list their full contextLength, and kvCacheGB reports the
// full-context cache cost; but we don't demand VRAM for 128K by default, since
// almost no one runs local models maxed out (and it would unfairly sink
// sliding-window models whose real KV cache stays small).
const SCORING_CONTEXT_CEILING = 32768;

// Bits per KV-cache element. Defaults to 8 to match the app's llama.cpp default
// (`--cache-type-k q8_0 --cache-type-v q8_0`). Lower this to model aggressive
// KV-quant schemes — e.g. ~3 bits for a TurboQuant-style cache.
export const DEFAULT_KV_BITS = 8;

function estimateKvCacheGB(paramsB: number, contextTokens: number, kvBits: number): number {
  const fp16 = KV_GB_PER_B_PER_1K_FP16 * paramsB * (contextTokens / 1000);
  return fp16 * (kvBits / 16);
}

function labelAndScoreFromRatio(ratio: number): { label: FitLabel; score: number } {
  if (ratio < 0.9) {
    return { label: "WON'T FIT", score: Math.max(0, Math.round(ratio * 50)) };
  }
  if (ratio < 1.15) {
    return { label: "TIGHT", score: Math.round(60 + ((ratio - 0.9) / 0.25) * 15) };
  }
  if (ratio < 1.6) {
    return { label: "GOOD", score: Math.round(75 + ((ratio - 1.15) / 0.45) * 15) };
  }
  return { label: "PERFECT", score: Math.min(100, Math.round(90 + (ratio - 1.6) * 5)) };
}

function estimateSpeed(mode: "gpu" | "cpu", paramsB: number, arch: ModelArch): number {
  if (arch === "mamba-hybrid") {
    // Hybrid Mamba-2 models keep most layers stateful (no growing KV cache), so
    // throughput stays high, degrades far less with size, and — unlike dense
    // transformers — barely drops as the generated sequence gets longer. Rough
    // ~2x-dense estimate; refine once we have real measurements.
    if (mode === "gpu") {
      if (paramsB <= 8) return 90;
      if (paramsB <= 14) return 60;
      if (paramsB <= 32) return 30;
      return 12;
    }
    if (paramsB <= 8) return 10;
    if (paramsB <= 14) return 5;
    return 1.5;
  }
  if (mode === "gpu") {
    if (paramsB <= 3) return 60;
    if (paramsB <= 8) return 45;
    if (paramsB <= 14) return 25;
    if (paramsB <= 32) return 12;
    return 5;
  }
  if (paramsB <= 3) return 12;
  if (paramsB <= 8) return 5;
  if (paramsB <= 14) return 2;
  return 0.5;
}

export function computeFitScore(
  hardware: HardwareInfo,
  model: CatalogModel,
  kvBits: number = DEFAULT_KV_BITS,
): FitResult {
  const arch = model.arch ?? "dense";

  // KV cache at a realistic working context, and the extra it costs beyond the
  // ~8K baseline already folded into the catalog's VRAM/RAM figures.
  const scoringTokens = Math.min(model.contextLength, SCORING_CONTEXT_CEILING);
  const scoringKvGB = estimateKvCacheGB(model.paramsB, scoringTokens, kvBits);
  const baselineKvGB = estimateKvCacheGB(model.paramsB, KV_BASELINE_TOKENS, kvBits);
  const extraKvGB = Math.max(0, scoringKvGB - baselineKvGB);

  const mode: "gpu" | "cpu" = hardware.vramGB >= model.minVramGB + extraKvGB ? "gpu" : "cpu";

  const ratio =
    mode === "gpu"
      ? hardware.vramGB / (model.recommendedVramGB + extraKvGB)
      : hardware.availableRamGB / (model.minRamGB * 1.15 + extraKvGB);

  let { label, score } = labelAndScoreFromRatio(ratio);

  if (mode === "cpu") {
    score = Math.max(0, score - 10);
    if (hardware.cpuCores < 4) score = Math.max(0, score - 5);
    if (score < 60 && label !== "WON'T FIT") label = "TIGHT";
  }

  return {
    modelId: model.id,
    mode,
    ratio: Math.round(ratio * 100) / 100,
    score,
    label,
    estTokPerSec: estimateSpeed(mode, model.paramsB, arch),
    kvCacheGB: Math.round(estimateKvCacheGB(model.paramsB, model.contextLength, kvBits) * 10) / 10,
  };
}

export function scoreCatalog(
  hardware: HardwareInfo,
  kvBits: number = DEFAULT_KV_BITS,
): (CatalogModel & FitResult)[] {
  return CATALOG_MODELS.map((model) => ({
    ...model,
    ...computeFitScore(hardware, model, kvBits),
  })).sort((a, b) => b.score - a.score);
}

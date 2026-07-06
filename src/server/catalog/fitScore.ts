import modelsJson from "./models.json";
import type { HardwareInfo } from "@/server/hardware/scan";

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
};

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

function estimateSpeed(mode: "gpu" | "cpu", paramsB: number): number {
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

export function computeFitScore(hardware: HardwareInfo, model: CatalogModel): FitResult {
  const mode: "gpu" | "cpu" = hardware.vramGB >= model.minVramGB ? "gpu" : "cpu";

  const ratio =
    mode === "gpu"
      ? hardware.vramGB / model.recommendedVramGB
      : hardware.availableRamGB / (model.minRamGB * 1.15);

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
    estTokPerSec: estimateSpeed(mode, model.paramsB),
  };
}

export function scoreCatalog(hardware: HardwareInfo): (CatalogModel & FitResult)[] {
  return CATALOG_MODELS.map((model) => ({
    ...model,
    ...computeFitScore(hardware, model),
  })).sort((a, b) => b.score - a.score);
}

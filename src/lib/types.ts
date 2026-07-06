export type HardwareInfo = {
  cpuCores: number;
  cpuModel: string;
  totalRamGB: number;
  availableRamGB: number;
  gpuModel: string | null;
  vramGB: number;
  scannedAt: number;
};

export type FitLabel = "PERFECT" | "GOOD" | "TIGHT" | "WON'T FIT";

export type ScoredModel = {
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
  modelId: string;
  mode: "gpu" | "cpu";
  ratio: number;
  score: number;
  label: FitLabel;
  estTokPerSec: number;
};

export type ModelOption = {
  id: string;
  backend: "ollama" | "llamacpp";
  label: string;
  contextLength?: number;
  port?: number;
  idle?: boolean;
};

export type LlamaCppServerRow = {
  id: string;
  name: string;
  modelPath: string;
  port: number;
  extraArgs: string | null;
  tmuxSession: string | null;
  status: string;
  pid: number | null;
  lastStartedAt: number | null;
  createdAt: number;
};

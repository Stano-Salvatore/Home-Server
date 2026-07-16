// Single source of truth for which backends a model/conversation/task can
// target — mirrors server/backends/types.ts's ModelBackend["kind"]. Import
// this instead of repeating the "ollama" | "llamacpp" | "litertlm" literal;
// a stale copy of that union silently stops type-checking real assignments
// once a new backend is added (litertlm was missing from every client-side
// copy of this union until this fix — no runtime bug since JSON responses
// are untyped, but it made the type checker blind to real mismatches).
export type ChatBackend = "ollama" | "llamacpp" | "litertlm";

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
  backend: ChatBackend;
  label: string;
  contextLength?: number;
  port?: number;
  idle?: boolean;
  nodeId?: string;
  nodeName?: string;
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

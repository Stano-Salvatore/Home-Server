import { spawn } from "node:child_process";
import os from "node:os";
import si from "systeminformation";
import { getSetting, setSetting } from "@/server/settings/config";

export type HardwareInfo = {
  cpuCores: number;
  cpuModel: string;
  totalRamGB: number;
  availableRamGB: number;
  gpuModel: string | null;
  vramGB: number;
  scannedAt: number;
};

const CACHE_KEY = "hardware_scan";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function bytesToGB(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

async function tryNvidiaSmiVramGB(): Promise<{ model: string; vramGB: number } | null> {
  return new Promise((resolve) => {
    const child = spawn("nvidia-smi", [
      "--query-gpu=name,memory.total",
      "--format=csv,noheader,nounits",
    ]);
    let out = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0 || !out.trim()) return resolve(null);
      const [name, memMiB] = out.trim().split("\n")[0].split(",").map((s) => s.trim());
      const mb = parseFloat(memMiB);
      if (!name || Number.isNaN(mb)) return resolve(null);
      resolve({ model: name, vramGB: Math.round((mb / 1024) * 10) / 10 });
    });
  });
}

async function scanHardware(): Promise<HardwareInfo> {
  const [cpu, mem, graphics] = await Promise.all([si.cpu(), si.mem(), si.graphics()]);

  let gpuModel: string | null = null;
  let vramGB = 0;

  const nvidia = await tryNvidiaSmiVramGB();
  if (nvidia) {
    gpuModel = nvidia.model;
    vramGB = nvidia.vramGB;
  } else {
    const withVram = graphics.controllers.find((c) => c.vram && c.vram > 0);
    if (withVram) {
      gpuModel = withVram.model || withVram.vendor;
      vramGB = Math.round(((withVram.vram as number) / 1024) * 10) / 10;
    } else if (graphics.controllers.length > 0) {
      gpuModel = graphics.controllers[0].model || graphics.controllers[0].vendor;
      vramGB = 0;
    }
  }

  // systeminformation can't parse Android/Termux's /proc/cpuinfo on some ARM
  // SoCs (e.g. Qualcomm Oryon / Snapdragon X), returning 0 for both core counts.
  // Fall back to Node's own view — os.availableParallelism() respects CPU
  // affinity, os.cpus().length is the raw logical count — so we never report 0.
  const osCores = os.availableParallelism?.() || os.cpus().length || 1;

  return {
    cpuCores: cpu.physicalCores || cpu.cores || osCores,
    cpuModel: cpu.brand || `${cpu.manufacturer} CPU`,
    totalRamGB: bytesToGB(mem.total),
    availableRamGB: bytesToGB(mem.available),
    gpuModel,
    vramGB,
    scannedAt: Date.now(),
  };
}

export async function getHardware(forceRescan = false): Promise<HardwareInfo> {
  if (!forceRescan) {
    const cached = getSetting(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as HardwareInfo;
      if (Date.now() - parsed.scannedAt < CACHE_TTL_MS) return parsed;
    }
  }

  const fresh = await scanHardware();
  setSetting(CACHE_KEY, JSON.stringify(fresh));
  return fresh;
}

import { probeNodes } from "@/server/backends/registry";
import { getHardware } from "@/server/hardware/scan";
import { probeServices } from "@/server/nodes/services";
import { HOME_ASSISTANT_TOOLS, homeAssistantConfigured } from "./homeassistant";
import { REMINDER_TOOLS } from "./reminders";
import type { BuiltinTool } from "./types";

export type { BuiltinTool };

// Nedory's own dashboard state, exposed as tools — no network hop, no setup,
// available to any agent with tool calling on. This is what gives Gemmi
// (the "SysOps logging & precision" persona) something real to answer from,
// with zero configuration.
const NEDORY_BUILTIN_TOOLS: BuiltinTool[] = [
  {
    name: "nedory_node_status",
    description:
      "List every compute node in the fleet with online/offline state, which models are " +
      "currently loaded in memory, and which are installed. Use for questions about the " +
      "fleet's health or what models are available.",
    call: async () => {
      const nodes = await probeNodes();
      if (nodes.length === 0) return "No nodes configured.";
      return nodes
        .map((n) => {
          if (!n.online) return `${n.name} (${n.url}) — OFFLINE`;
          return (
            `${n.name} (${n.url}) — online\n` +
            `  loaded: ${n.loaded.join(", ") || "none"}\n` +
            `  installed: ${n.installed.join(", ") || "none"}`
          );
        })
        .join("\n");
    },
  },
  {
    name: "nedory_hardware",
    description:
      "Get this machine's hardware: CPU, RAM, GPU/VRAM. Use for questions about what this " +
      "device can run or how much headroom it has.",
    call: async () => {
      const hw = await getHardware(false);
      return (
        `CPU: ${hw.cpuModel} (${hw.cpuCores} cores)\n` +
        `RAM: ${hw.availableRamGB}GB available / ${hw.totalRamGB}GB total\n` +
        `GPU: ${hw.gpuModel ?? "none detected"}${hw.vramGB ? ` (${hw.vramGB}GB VRAM)` : ""}`
      );
    },
  },
  {
    name: "nedory_service_health",
    description:
      "Check whether auxiliary services (Kiwix offline Wikipedia, Qdrant vector store) are " +
      "currently reachable.",
    call: async () => {
      const services = await probeServices();
      if (services.length === 0) return "No auxiliary services configured.";
      return services.map((s) => `${s.name} (${s.kind}) — ${s.online ? "online" : "OFFLINE"}`).join("\n");
    },
  },
  ...REMINDER_TOOLS,
];

// A function, not a constant — Home Assistant is Settings-backed and can be
// configured/unconfigured at runtime, so the tool list has to be recomputed
// per call rather than fixed at module load.
export function getBuiltinTools(): BuiltinTool[] {
  const tools = [...NEDORY_BUILTIN_TOOLS];
  if (homeAssistantConfigured()) tools.push(...HOME_ASSISTANT_TOOLS);
  return tools;
}

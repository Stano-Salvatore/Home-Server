import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { HardwareInfo } from "@/lib/types";
import { RotateCw } from "lucide-react";

export function HardwareCard({
  hardware,
  rescanning,
  onRescan,
}: {
  hardware: HardwareInfo | null;
  rescanning: boolean;
  onRescan: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-neutral-200">Detected hardware</h2>
        <Button variant="secondary" onClick={onRescan} disabled={rescanning}>
          <RotateCw size={14} className={rescanning ? "animate-spin" : ""} />
          {rescanning ? "Scanning…" : "Rescan"}
        </Button>
      </div>
      {!hardware ? (
        <p className="text-sm text-neutral-500">Scanning…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label="CPU" value={hardware.cpuModel} sub={`${hardware.cpuCores} cores`} />
          <Stat
            label="RAM"
            value={`${hardware.availableRamGB} GB free`}
            sub={`${hardware.totalRamGB} GB total`}
          />
          <Stat
            label="GPU"
            value={hardware.gpuModel ?? "None detected"}
            sub={hardware.gpuModel ? undefined : "CPU-only inference"}
          />
          <Stat
            label="VRAM"
            value={hardware.vramGB > 0 ? `${hardware.vramGB} GB` : "—"}
          />
        </div>
      )}
      {hardware && (
        <p className="text-xs text-neutral-600 mt-4">
          Last scanned {new Date(hardware.scannedAt).toLocaleString()}
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500 mb-0.5">{label}</div>
      <div className="text-neutral-100 font-medium truncate" title={value}>
        {value}
      </div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

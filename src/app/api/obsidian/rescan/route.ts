import { NextResponse } from "next/server";
import { rescanVault } from "@/server/obsidian/watcher";
import { loadSettings, pathStatus } from "@/server/settings/config";

export const runtime = "nodejs";

export async function POST() {
  const { vaultPath } = loadSettings();
  if (!vaultPath || !pathStatus(vaultPath).exists) {
    return NextResponse.json({ error: "No valid Obsidian vault configured" }, { status: 400 });
  }
  try {
    const result = await rescanVault(vaultPath);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { rescanAllVaults } from "@/server/obsidian/watcher";
import { listVaults } from "@/server/obsidian/vaults";

export const runtime = "nodejs";

export async function POST() {
  if (listVaults().length === 0) {
    return NextResponse.json({ error: "No Obsidian vault configured" }, { status: 400 });
  }
  try {
    const vaults = await rescanAllVaults();
    const total = vaults.reduce((n, v) => n + v.total, 0);
    const indexed = vaults.reduce((n, v) => n + v.indexed, 0);
    return NextResponse.json({ total, indexed, vaults });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

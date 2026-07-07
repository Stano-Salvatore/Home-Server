import { NextRequest, NextResponse } from "next/server";
import { listVaults, addVault, deleteVault } from "@/server/obsidian/vaults";
import { pathStatus } from "@/server/settings/config";

export const runtime = "nodejs";

function withStatus() {
  return listVaults().map((v) => ({ ...v, status: pathStatus(v.path) }));
}

export async function GET() {
  return NextResponse.json({ vaults: withStatus() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const path = typeof body.path === "string" ? body.path.trim() : "";
  if (!path) {
    return NextResponse.json({ error: "A vault path is required" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  addVault(name, path);

  const { restartVaultWatchers } = await import("@/server/obsidian/watcher");
  await restartVaultWatchers();

  return NextResponse.json({ vaults: withStatus() });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "A vault id is required" }, { status: 400 });
  }
  deleteVault(id);

  const { restartVaultWatchers } = await import("@/server/obsidian/watcher");
  await restartVaultWatchers();

  return NextResponse.json({ vaults: withStatus() });
}

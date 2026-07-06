import { NextRequest, NextResponse } from "next/server";
import { loadSettings, updateSettings, pathStatus } from "@/server/settings/config";

export const runtime = "nodejs";

export async function GET() {
  const config = loadSettings();
  return NextResponse.json({
    config,
    status: {
      vaultPath: pathStatus(config.vaultPath),
      libraryPath: pathStatus(config.libraryPath),
      uploadsPath: pathStatus(config.uploadsPath),
    },
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const config = updateSettings(body);

  if (body.vaultPath !== undefined) {
    const { restartVaultWatcher } = await import("@/server/obsidian/watcher");
    await restartVaultWatcher(config.vaultPath);
  }

  return NextResponse.json({
    config,
    status: {
      vaultPath: pathStatus(config.vaultPath),
      libraryPath: pathStatus(config.libraryPath),
      uploadsPath: pathStatus(config.uploadsPath),
    },
  });
}

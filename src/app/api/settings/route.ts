import { NextRequest, NextResponse } from "next/server";
import { loadSettings, updateSettings, pathStatus, maskSecrets, secretsPresence } from "@/server/settings/config";

export const runtime = "nodejs";

export async function GET() {
  const config = loadSettings();
  return NextResponse.json({
    config: maskSecrets(config),
    secretsSet: secretsPresence(config),
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
    const { restartVaultWatchers } = await import("@/server/obsidian/watcher");
    await restartVaultWatchers();
  }

  return NextResponse.json({
    config: maskSecrets(config),
    secretsSet: secretsPresence(config),
    status: {
      vaultPath: pathStatus(config.vaultPath),
      libraryPath: pathStatus(config.libraryPath),
      uploadsPath: pathStatus(config.uploadsPath),
    },
  });
}

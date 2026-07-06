import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getFile } from "@/server/files/storage";
import { loadSettings } from "@/server/settings/config";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]/content">) {
  const { id } = await ctx.params;
  const file = getFile(id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { uploadsPath } = loadSettings();
  const storedPath = path.join(uploadsPath, file.storedName);
  if (!fs.existsSync(storedPath)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = fs.readFileSync(storedPath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`,
    },
  });
}

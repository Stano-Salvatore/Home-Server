import { NextRequest, NextResponse } from "next/server";
import { listFiles, saveUploadedFile } from "@/server/files/storage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ files: listFiles() });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveUploadedFile({
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    buffer,
  });
  return NextResponse.json({ file: saved });
}

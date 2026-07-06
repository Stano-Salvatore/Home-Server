import { NextResponse } from "next/server";
import { listInstalledTags } from "@/server/backends/ollama";

export const runtime = "nodejs";

export async function GET() {
  const tags = await listInstalledTags();
  return NextResponse.json({ tags });
}

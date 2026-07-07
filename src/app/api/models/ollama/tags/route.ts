import { NextResponse } from "next/server";
import { listInstalledTags } from "@/server/backends/ollama";
import { defaultNode } from "@/server/nodes/nodes";

export const runtime = "nodejs";

export async function GET() {
  const tags = await listInstalledTags(defaultNode().url);
  return NextResponse.json({ tags });
}

import { NextResponse } from "next/server";
import { listAllModelOptions } from "@/server/backends/registry";
import { listServers } from "@/server/backends/llamacpp";

export const runtime = "nodejs";

export async function GET() {
  const [options, llamacppServers] = await Promise.all([listAllModelOptions(), listServers()]);
  return NextResponse.json({ options, llamacppServers });
}

import { NextResponse } from "next/server";
import { chatMemoryStats } from "@/server/brain/chatMemory";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(chatMemoryStats());
}

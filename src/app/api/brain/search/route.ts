import { NextRequest, NextResponse } from "next/server";
import { searchBrain } from "@/server/brain/search";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { query, topK } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  try {
    const hits = await searchBrain(query, topK ?? 5);
    return NextResponse.json({ hits });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { reindexAllDocuments } from "@/server/brain/reindex";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await reindexAllDocuments();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

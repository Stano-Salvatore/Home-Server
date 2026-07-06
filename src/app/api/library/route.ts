import { NextResponse } from "next/server";
import { listBooks, scanLibrary } from "@/server/library/scanner";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ books: listBooks() });
}

export async function POST() {
  try {
    const summary = await scanLibrary();
    return NextResponse.json({ summary, books: listBooks() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

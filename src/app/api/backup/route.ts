import { NextResponse } from "next/server";
import { backupDatabase } from "@/server/backup/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const path = backupDatabase();
    return NextResponse.json({ path });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed" },
      { status: 500 },
    );
  }
}

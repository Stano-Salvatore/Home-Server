import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/server/auth/session";

export const runtime = "nodejs";

// Deliberately public (see proxy.ts's PUBLIC_PATHS) — reveals only whether
// the dashboard has a password set, nothing about its value.
export async function GET() {
  return NextResponse.json({ enabled: isAuthEnabled() });
}

import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, setDashboardSecret, verifySessionToken } from "@/server/auth/session";
import { COOKIE_NAME } from "@/proxy";

export const runtime = "nodejs";

// Sets or changes the dashboard password. Reachable without a session only
// on first-time setup (no password configured yet) — proxy.ts already
// enforces this by gating everything except /login, /api/auth/{login,
// status,logout} once a password exists, but per Next's own guidance
// ("verify authentication inside each Server Function rather than relying
// on Proxy alone" — a matcher change could silently drop coverage), the
// same check is repeated here rather than trusted blindly.
export async function PUT(req: NextRequest) {
  if (isAuthEnabled()) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!verifySessionToken(token)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
  }

  const { password } = await req.json();
  if (typeof password !== "string") {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }
  setDashboardSecret(password);
  return NextResponse.json({ enabled: !!password.trim() });
}

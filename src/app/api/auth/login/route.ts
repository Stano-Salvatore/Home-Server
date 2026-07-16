import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSession, isAuthEnabled } from "@/server/auth/session";
import { COOKIE_NAME } from "@/proxy";

export const runtime = "nodejs";

const SESSION_MAX_AGE_S = 90 * 24 * 60 * 60; // mirrors session.ts's SESSION_TTL_MS

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Dashboard password is not set" }, { status: 400 });
  }
  const { password } = await req.json();
  if (typeof password !== "string" || !checkPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    // Not forced true: this dashboard is reached over plain http:// on a
    // LAN/Tailscale, not https:// — a `secure` cookie would silently never
    // be sent and every login would appear to fail.
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}

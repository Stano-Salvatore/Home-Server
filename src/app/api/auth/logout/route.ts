import { NextRequest, NextResponse } from "next/server";
import { revokeSessionToken } from "@/server/auth/session";
import { COOKIE_NAME } from "@/proxy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  revokeSessionToken(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}

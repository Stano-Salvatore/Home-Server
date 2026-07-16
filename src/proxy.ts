import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthEnabled, verifySessionToken } from "@/server/auth/session";

// Next.js 16 renamed middleware.ts -> proxy.ts (same Node.js-runtime-by-
// default behavior, just a clearer name — see the migration note in
// node_modules/next/dist/docs/.../file-conventions/proxy.md). Gates the
// entire dashboard behind one shared secret when the owner has set one in
// Settings; with no secret set (the default), this is a no-op on every
// request, so shipping it changes nothing for anyone who hasn't opted in.

export const COOKIE_NAME = "nedory_session";

// Deliberately narrow: /api/auth/password (setting/changing the password)
// must NOT be exempt once auth is already on — an earlier draft of this
// exempted the whole /api/auth/* prefix, which would have let anyone
// overwrite an already-set password without ever logging in.
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/status", "/api/auth/logout"]);

export function proxy(request: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (verifySessionToken(token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Static assets, PWA/manifest files and icons stay reachable without a
// session — otherwise the login page's own CSS/JS (or the manifest the
// phone's "Add to Home Screen" reads) would 401/redirect-loop along with
// everything else.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|icon-|apple-touch-icon|manifest\\.webmanifest|fonts/).*)",
  ],
};

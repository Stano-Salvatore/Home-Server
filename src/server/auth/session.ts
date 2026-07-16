import crypto from "node:crypto";
import { getSetting, setSetting } from "@/server/settings/config";

// Dashboard-wide auth: one shared secret protects the whole app, matching
// the actual threat model (this is a personal home-server dashboard reached
// over Tailscale/LAN, not a multi-user SaaS product — no accounts, no
// roles). Off by default: an empty secret means every check below
// short-circuits to "allow", so shipping this changes nothing until the
// user deliberately sets a password in Settings.
//
// Reads here go straight through getSetting() (a raw, uncached key lookup)
// rather than loadSettings()'s cached AppConfig — the auth gate must see a
// password change or logout take effect on the very next request, and
// proxy.ts may run in a separate module instance from the rest of the app
// with its own copy of that cache (Next's "don't rely on shared globals
// across Proxy" guidance), so a cached value here could go stale.

const SECRET_KEY = "dashboard_secret";
const SESSIONS_KEY = "dashboard_sessions";
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_SESSIONS = 20; // oldest dropped first; a handful of devices, generously

type StoredSession = { tokenHash: string; expiresAt: number };

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Fixed-length digest comparison via timingSafeEqual — comparing raw
// strings of different lengths throws (a real crash bug in naive
// implementations), and comparing them directly leaks length/content via
// timing. Hashing both sides to the same digest size sidesteps both.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(sha256(a));
  const bufB = Buffer.from(sha256(b));
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isAuthEnabled(): boolean {
  return !!getSetting(SECRET_KEY)?.trim();
}

export function checkPassword(candidate: string): boolean {
  const secret = getSetting(SECRET_KEY)?.trim();
  if (!secret) return false; // auth disabled — never "succeeds" into a session
  return safeEqual(candidate, secret);
}

export function setDashboardSecret(secret: string) {
  setSetting(SECRET_KEY, secret.trim());
  if (!secret.trim()) {
    // Disabling auth invalidates every outstanding session — otherwise a
    // stale cookie from before would silently keep working forever with no
    // password behind it.
    setSetting(SESSIONS_KEY, "[]");
  }
}

function loadSessions(): StoredSession[] {
  const raw = getSetting(SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: StoredSession[]) {
  setSetting(SESSIONS_KEY, JSON.stringify(sessions));
}

/** Creates a new session and returns the raw token — the only time it's ever
 *  in plaintext. Only the sha256 hash is persisted. */
export function createSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const sessions = loadSessions()
    .filter((s) => s.expiresAt > now)
    .slice(-(MAX_SESSIONS - 1));
  sessions.push({ tokenHash: sha256(token), expiresAt: now + SESSION_TTL_MS });
  saveSessions(sessions);
  return token;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  if (!isAuthEnabled()) return false; // auth got disabled since this cookie was set
  const now = Date.now();
  const hash = sha256(token);
  return loadSessions().some((s) => s.tokenHash === hash && s.expiresAt > now);
}

export function revokeSessionToken(token: string | undefined) {
  if (!token) return;
  const hash = sha256(token);
  saveSessions(loadSessions().filter((s) => s.tokenHash !== hash));
}

import crypto from "node:crypto";
import { getSetting, setSetting } from "@/server/settings/config";
import { readJsonBlob, writeJsonBlob, isPlainObject } from "@/server/settings/jsonBlob";

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

// Login rate-limiting: a small exponential backoff, not a full lockout —
// this is a single-user personal dashboard on a LAN/Tailscale, not a
// multi-tenant service, so a global (not per-IP) counter matches the actual
// threat model. First few failures (typos) get an instant retry; beyond
// that each additional failure roughly doubles the enforced wait, capped.
const ATTEMPTS_KEY = "dashboard_login_attempts";
const FREE_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

type LoginAttempts = { count: number; lastAttemptAt: number };

function loadAttempts(): LoginAttempts {
  const a = readJsonBlob<Partial<LoginAttempts>>(
    ATTEMPTS_KEY,
    {},
    isPlainObject as (v: unknown) => v is Partial<LoginAttempts>,
  );
  return { count: a.count ?? 0, lastAttemptAt: a.lastAttemptAt ?? 0 };
}

/** How many ms the caller must wait before the next login attempt is
 *  allowed. 0 = go ahead now. */
export function loginBackoffMs(): number {
  const { count, lastAttemptAt } = loadAttempts();
  if (count <= FREE_ATTEMPTS) return 0;
  const delay = Math.min(BASE_DELAY_MS * 2 ** (count - FREE_ATTEMPTS - 1), MAX_DELAY_MS);
  return Math.max(0, delay - (Date.now() - lastAttemptAt));
}

export function recordLoginFailure() {
  const a = loadAttempts();
  writeJsonBlob<LoginAttempts>(ATTEMPTS_KEY, { count: a.count + 1, lastAttemptAt: Date.now() });
}

export function recordLoginSuccess() {
  writeJsonBlob<LoginAttempts>(ATTEMPTS_KEY, { count: 0, lastAttemptAt: 0 });
}

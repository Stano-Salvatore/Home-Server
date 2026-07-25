import path from "node:path";
import fs from "node:fs";
import { sqlite } from "@/server/db/client";
import { loadSettings } from "@/server/settings/config";

const DEFAULT_BACKUP_DIR = path.join(process.cwd(), "data", "backups");
const KEEP_BACKUPS = 14; // ~2 weeks at one nightly backup/day

function backupDir(): string {
  return loadSettings().dbBackupDir.trim() || DEFAULT_BACKUP_DIR;
}

/** Writes a timestamped, consistent snapshot of the live DB and prunes old
 *  ones beyond KEEP_BACKUPS. Returns the path written. */
export function backupDatabase(): string {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(dir, `app-${stamp}.db`);

  // VACUUM INTO is SQLite's own atomic, point-in-time backup mechanism —
  // safe against the live process still writing to this DB (WAL mode),
  // unlike a plain file copy which could grab a half-written page or miss
  // recent writes still sitting in the WAL file. The destination path is
  // always server-generated (never raw user input), but the quote is still
  // escaped defensively since VACUUM INTO takes a string literal, not a
  // bindable parameter.
  sqlite.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);

  pruneOldBackups(dir);
  return dest;
}

function pruneOldBackups(dir: string) {
  const backups = fs
    .readdirSync(dir)
    .filter((f) => /^app-.*\.db$/.test(f))
    .map((f) => ({ name: f, mtimeMs: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const { name } of backups.slice(KEEP_BACKUPS)) {
    fs.unlinkSync(path.join(dir, name));
  }
}

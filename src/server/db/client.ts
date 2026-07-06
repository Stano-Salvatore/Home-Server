import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "app.db");

declare global {
  var __homeServerDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var __homeServerSqlite: Database.Database | undefined;
}

function createDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  globalThis.__homeServerSqlite = sqlite;
  return drizzle(sqlite, { schema });
}

// NOTE: deliberately does NOT run migrations here. This module gets imported
// (and this top-level code executed) merely by `next build` collecting page
// data for every route, across several parallel workers — running the
// migrator here raced those workers against the same on-disk file ("table
// already exists"). Migrations are applied exactly once by runMigrations(),
// called only from instrumentation.ts's bootstrap() at actual server start.
export const db = globalThis.__homeServerDb ?? (globalThis.__homeServerDb = createDb());
export const sqlite = globalThis.__homeServerSqlite!;

let migrated = false;

export function runMigrations() {
  if (migrated) return;
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  migrated = true;
}

import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { BaseSQLiteDatabase, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { BetterSQLiteSession } from "drizzle-orm/better-sqlite3/session";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { extractTablesRelationalConfig, createTableRelationsHelpers } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "app.db");

// Thin adapter: make Node's built-in node:sqlite (DatabaseSync) look enough
// like a better-sqlite3 Database for drizzle's session + migrator. This avoids
// a native (node-gyp) build entirely, which is what lets the app install and
// run on Android/Termux where better-sqlite3 can't compile.
function createNodeSqliteClient(dbPath: string) {
  const raw = new DatabaseSync(dbPath);

  function prepare(sql: string) {
    let native: ReturnType<typeof raw.prepare> | undefined;
    const nat = () => (native ??= raw.prepare(sql));
    return {
      run: (...params: unknown[]) => nat().run(...params),
      all: (...params: unknown[]) => nat().all(...params),
      get: (...params: unknown[]) => nat().get(...params),
      // drizzle uses .raw() for array-mode rows; return a separate view so the
      // object-mode and array-mode paths never fight over sticky state.
      raw() {
        const s = nat();
        return {
          all: (...params: unknown[]) => s.all(...params).map((r) => Object.values(r)),
          get: (...params: unknown[]) => {
            const r = s.get(...params);
            return r ? Object.values(r) : r;
          },
          run: (...params: unknown[]) => s.run(...params),
        };
      },
    };
  }

  return {
    prepare,
    exec: (sql: string) => raw.exec(sql),
    pragma: (statement: string) => raw.exec(`PRAGMA ${statement}`),
    transaction:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        raw.exec("BEGIN");
        try {
          const result = fn(...args);
          raw.exec("COMMIT");
          return result;
        } catch (err) {
          raw.exec("ROLLBACK");
          throw err;
        }
      },
    close: () => raw.close(),
  };
}

// Assemble the drizzle instance the same way drizzle-orm/better-sqlite3's
// construct() does, but WITHOUT importing that module — its top-level
// `require("better-sqlite3")` would crash at runtime once the native package
// is uninstalled. session.cjs, migrator.cjs and sqlite-core are all free of
// that require, so building from them keeps us native-free.
function createDb(): BetterSQLite3Database<typeof schema> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const client = createNodeSqliteClient(DB_PATH);
  // busy_timeout must be set first: `next build` collects page data across
  // several parallel workers that each open this same DB file, and without a
  // timeout node:sqlite throws "database is locked" instantly on contention.
  client.pragma("busy_timeout = 10000");
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  globalThis.__homeServerSqlite = client;

  const dialect = new SQLiteSyncDialect();
  const tablesConfig = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
  const schemaConfig = {
    fullSchema: schema,
    schema: tablesConfig.tables,
    tableNamesMap: tablesConfig.tableNamesMap,
  };
  const session = new BetterSQLiteSession(
    client as unknown as BetterSqlite3Database,
    dialect,
    schemaConfig,
    {},
  );
  return new BaseSQLiteDatabase(
    "sync",
    dialect,
    session,
    schemaConfig,
  ) as unknown as BetterSQLite3Database<typeof schema>;
}

declare global {
  var __homeServerDb: BetterSQLite3Database<typeof schema> | undefined;
  var __homeServerSqlite: ReturnType<typeof createNodeSqliteClient> | undefined;
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

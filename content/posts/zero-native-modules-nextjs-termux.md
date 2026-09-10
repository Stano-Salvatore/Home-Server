---
title: "Zero native modules: running Next.js, SQLite and RAG on an Android phone"
description: "How to build a full Next.js + Drizzle + SQLite app that installs on Termux, where node-gyp cannot run — including two next build gotchas nobody documents."
date: 2026-09-10
tags: [nextjs, sqlite, termux, android, drizzle, self-hosted]
draft: true
---

I run a self-hosted AI workspace on a phone. Not a phone talking to a server — the
Next.js app, the SQLite database, the RAG pipeline and the scheduler all run in
Termux on a Galaxy S25 Ultra, and the whole thing works with the network off.

The interesting part is not the AI. It is that `npm install` finishes at all.

## The problem: node-gyp does not exist here

Termux is a real Linux userland on Android, but it is not a normal build host.
The moment your dependency tree contains a native module, `npm install` tries to
either download a prebuilt binary for your platform or compile one with `node-gyp`.
On Android aarch64 there is usually no prebuilt binary, and the compile fails on
missing headers or a toolchain that does not match.

For a typical Next.js app, two dependencies cause almost all of this pain:

- `better-sqlite3`, the default SQLite driver for most Node ORMs
- `sharp`, which Next.js pulls in for image optimization

Remove both and the entire install becomes pure JavaScript. That is the whole trick,
and the rest of this post is how to do it without giving up an ORM or migrations.

## Replacing better-sqlite3 with node:sqlite

Node ships its own SQLite now. `node:sqlite` was experimental for a while and is
unflagged from Node 24 onward, which means you get a synchronous, better-sqlite3-
shaped API with no install step at all:

```js
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/app.db");
db.exec("PRAGMA journal_mode = WAL");
```

That is the entire dependency. No binary, no compile, no postinstall.

## Drizzle: use the official driver

When I built this, Drizzle had no node:sqlite support, so I wrote a 120-line adapter
that made `DatabaseSync` look enough like a better-sqlite3 `Database` for Drizzle's
session and migrator to accept it. It worked, and you should not copy it.

Drizzle now ships an official driver. Use that instead:

```js
import { drizzle } from "drizzle-orm/node-sqlite";
import { DatabaseSync } from "node:sqlite";

const sqlite = new DatabaseSync("data/app.db");
export const db = drizzle({ client: sqlite });
```

If you are on an older setup with a hand-rolled adapter, one detail is worth keeping
in mind: do not import from `drizzle-orm/better-sqlite3` directly. That module has a
top-level `require("better-sqlite3")`, so it throws at runtime the moment the native
package is actually gone. Import from `sqlite-core`, `session` and `migrator`
individually if you ever need to assemble things by hand.

## The gap that still exists: drizzle-kit

Runtime is solved. Migrations are not.

`drizzle-kit` still does not support `node:sqlite` as a driver. To generate or push
migrations it wants `better-sqlite3`, `bun`, `@libsql/client` or `@tursodatabase/database`
installed. There is an open issue tracking it.

Two ways around this, and I use the second:

1. Generate migrations on a normal machine where `better-sqlite3` installs fine, and
   commit the generated SQL. The phone never runs drizzle-kit, only the SQL.
2. Apply the committed migrations at runtime, from your own code, using Drizzle's
   migrator rather than the CLI.

The second looks like this, and where you call it matters enormously.

## Two next build gotchas nobody documents

This is the part that cost me real hours, and I have not seen it written down anywhere.

**`next build` opens your database from several processes at once.** Collecting page
data runs across parallel workers, and every worker imports your route modules, which
import your database module, which opens the same file. Two consequences:

**Gotcha one: set `busy_timeout` before anything else.** Without it, `node:sqlite`
throws "database is locked" instantly on the first contention, and your build fails
with an error that looks nothing like a concurrency problem. Set it as the very first
pragma, before `journal_mode`:

```js
client.pragma("busy_timeout = 10000");   // must come first
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");
```

**Gotcha two: never run migrations at module top level.** If your db module runs the
migrator when it is imported, every build worker races to apply the same migration
and you get "table already exists" from whichever one loses. Export the function
instead, and call it exactly once from a real server-start hook:

```js
// db.js — defines it, does not call it
let migrated = false;
export function runMigrations() {
  if (migrated) return;
  migrate(db, { migrationsFolder: "drizzle" });
  migrated = true;
}
```

```js
// instrumentation.js — the one place it actually runs
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("./server/bootstrap");
    await bootstrap();   // calls runMigrations()
  }
}
```

`instrumentation.js` runs once per server start, not once per build worker. That is
the distinction that fixes it.

## Getting rid of sharp

Next.js only needs `sharp` if you use its image optimizer. If you avoid the
`next/image` component, it never becomes a required native build. For a self-hosted
dashboard serving your own files this costs you nothing — you are not optimizing
remote images at scale, you are showing a photo you already have on disk.

Check your lockfile after removing it. `sharp` can reappear as an optional dependency,
and optional is fine: npm skips it when it cannot build.

## What you actually get

```bash
pkg install nodejs git
git clone <repo> && cd <repo>
npm install        # no native build, finishes clean
npm run build && npm run start
```

A full Next.js 16 app with an ORM, migrations, WAL-mode SQLite, file watching, a cron
scheduler and a RAG pipeline, installing on a phone in about the time it takes to
download the packages.

The payoff is not really Android, though. It is that "no native modules" removes an
entire category of deployment problem everywhere. The same tree installs on Alpine
without build-base, on ARM boards, in slim containers, and on any CI runner that
would otherwise need a toolchain. Android is just the harshest test of that property,
which makes it a good one to build against.

## Notes

- Requires Node 24 or newer for unflagged `node:sqlite`
- Drizzle's official node-sqlite driver: `drizzle-orm/node-sqlite`
- drizzle-kit node:sqlite support is tracked in drizzle-orm issue #5471

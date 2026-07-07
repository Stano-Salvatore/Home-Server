// Intentional stub. The app uses Node's built-in `node:sqlite` and assembles
// the drizzle instance from drizzle-orm/better-sqlite3/session + sqlite-core
// directly, so drizzle-orm/better-sqlite3's driver (the only thing that
// require()s this package) is never imported at runtime. This file therefore
// never actually loads in normal operation — it exists purely so npm can
// satisfy drizzle-orm's optional `better-sqlite3` peer dependency WITHOUT
// running its node-gyp native build, which fails to compile on Android/Termux.
class Database {
  constructor() {
    throw new Error(
      "better-sqlite3 is stubbed in this project; it uses Node's built-in node:sqlite instead.",
    );
  }
}

module.exports = Database;
module.exports.default = Database;

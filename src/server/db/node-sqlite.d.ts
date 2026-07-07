// Minimal ambient declaration for Node's built-in SQLite module.
// @types/node v20 doesn't ship these types yet, but the module exists at
// runtime on Node 22.5+ (and is unflagged on Node 24+, which is what a
// Termux/Android deployment runs). We only declare the surface we use.
declare module "node:sqlite" {
  export interface StatementSync {
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  }
  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}

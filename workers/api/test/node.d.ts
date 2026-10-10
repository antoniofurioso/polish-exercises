// The few Node APIs the tests use, declared here because the package is typed
// for Workers only (@types/node would clash with @cloudflare/workers-types).

declare module "node:sqlite" {
  type Value = null | number | bigint | string | Uint8Array;
  export class StatementSync {
    all(...params: Value[]): Record<string, unknown>[];
    get(...params: Value[]): Record<string, unknown> | undefined;
    run(...params: Value[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    setReturnArrays?(on: boolean): void;
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module "node:fs" {
  export function readdirSync(path: string | URL): string[];
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}

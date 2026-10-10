import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";

/**
 * A D1Database over node:sqlite, in memory, with the real migrations applied
 * (plans/phase-4.md §17). Covers what the Worker uses: prepare/bind with `?`
 * and `?NNN` parameters, first/all/run/raw, batch (one transaction) and exec.
 */

type Value = null | number | bigint | string | Uint8Array;

const MIGRATIONS = new URL("../migrations/", import.meta.url);
const READS = /^\s*(SELECT|WITH|PRAGMA|VALUES)\b/i;
const RETURNING = /\bRETURNING\b/i;

/**
 * node:sqlite binds positional arguments to anonymous `?` only, so `?NNN`
 * (which D1 supports) is rewritten to `?` with the arguments reordered.
 * Good enough for the Worker's SQL, which has no `?` inside string literals.
 */
function positional(sql: string, params: unknown[]): { sql: string; args: Value[] } {
  const args: Value[] = [];
  let max = 0;
  const out = sql.replace(/\?(\d*)/g, (_m, n: string) => {
    const idx = n ? Number(n) : max + 1;
    max = Math.max(max, idx);
    args.push(toValue(params[idx - 1]));
    return "?";
  });
  return { sql: out, args };
}

function toValue(v: unknown): Value {
  if (v === undefined) throw new Error("D1_TYPE_ERROR: undefined cannot be bound");
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return v as Value;
}

function meta(changes = 0, lastRowId = 0) {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    changes,
    served_by: "node:sqlite",
  };
}

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params);
  }

  private prepared(): { stmt: StatementSync; args: Value[] } {
    const { sql, args } = positional(this.sql, this.params);
    return { stmt: this.db.prepare(sql), args };
  }

  /** Runs the statement, the way D1 reports it. */
  exec(): { results: Record<string, unknown>[]; success: true; meta: ReturnType<typeof meta> } {
    const { stmt, args } = this.prepared();
    if (READS.test(this.sql)) return { results: stmt.all(...args), success: true, meta: meta() };
    if (RETURNING.test(this.sql)) {
      const results = stmt.all(...args);
      return { results, success: true, meta: meta(results.length) };
    }
    const r = stmt.run(...args);
    return { results: [], success: true, meta: meta(Number(r.changes), Number(r.lastInsertRowid)) };
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.exec().results[0];
    if (!row) return null;
    return (column ? (row[column] ?? null) : row) as T;
  }

  async all<T = Record<string, unknown>>() {
    return this.exec() as unknown as D1Result<T>;
  }

  async run<T = Record<string, unknown>>() {
    return this.exec() as unknown as D1Result<T>;
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    const rows = this.exec().results;
    const out = rows.map((r) => Object.values(r)) as T[];
    if (options?.columnNames) out.unshift(Object.keys(rows[0] ?? {}) as T);
    return out;
  }
}

class TestD1 {
  constructor(readonly sqlite: DatabaseSync) {}

  prepare(sql: string): Statement {
    return new Statement(this.sqlite, sql);
  }

  /** All statements in one transaction, like D1: any error rolls the whole batch back. */
  async batch(statements: Statement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const out = statements.map((s) => s.exec());
      this.sqlite.exec("COMMIT");
      return out;
    } catch (err) {
      this.sqlite.exec("ROLLBACK");
      throw err;
    }
  }

  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: sql.split(";").filter((s) => s.trim()).length, duration: 0 };
  }

  withSession() {
    return this;
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error("dump is not supported by the test D1");
  }
}

/** A fresh in-memory D1 with every migration in migrations/ applied, in file order. */
export function createTestDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  }
  return new TestD1(sqlite) as unknown as D1Database;
}

/** The node:sqlite handle behind a test D1, for direct assertions. */
export const sqliteOf = (db: D1Database): DatabaseSync => (db as unknown as TestD1).sqlite;

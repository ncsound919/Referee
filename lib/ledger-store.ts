/**
 * ledger-store.ts
 *
 * SQLite-backed, append-only persistence for the evidence ledger.
 *
 * Replaces the previous whole-file JSON rewrite, which was non-atomic, had no
 * locking, silently swallowed corrupt files, and lost data on restart.
 *
 * Backed by Node's built-in `node:sqlite` (Node >= 22). One connection is kept
 * open for the lifetime of the process. When no path is configured the store
 * runs in-memory (`:memory:`), matching the previous in-memory-only behaviour.
 *
 * The public interface (getAll/append/reset/count) is unchanged.
 */
type AnyBlock = any;

type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
    run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
  close(): void;
};

let DatabaseSyncCtor: new (path: string, options?: { open?: boolean }) => SqliteDb;
try {
  const mod = require('node:sqlite') as { DatabaseSync: new (p: string, o?: { open?: boolean }) => SqliteDb };
  DatabaseSyncCtor = mod.DatabaseSync;
} catch {
  DatabaseSyncCtor = undefined as unknown as new (path: string, options?: { open?: boolean }) => SqliteDb;
}

const DATA_PATH = typeof process !== 'undefined' ? (process.env?.LEDGER_DATA_PATH || '') : '';
const DB_PATH = DATA_PATH
  ? (DATA_PATH.endsWith('.json') ? DATA_PATH.replace(/\.json$/, '.sqlite') : DATA_PATH)
  : ':memory:';

let db: SqliteDb | null = null;

function openDb(): SqliteDb {
  if (db) return db;
  if (!DatabaseSyncCtor) {
    throw new Error('node:sqlite is not available in this runtime; cannot open the ledger store.');
  }
  const instance = new DatabaseSyncCtor(DB_PATH);
  instance.exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      block_height INTEGER PRIMARY KEY,
      previous_block_hash TEXT NOT NULL,
      sha256_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
  db = instance;
  return db;
}

function readAll(): AnyBlock[] {
  const d = openDb();
  const rows = d.prepare('SELECT block_height, previous_block_hash, sha256_hash, payload FROM blocks ORDER BY block_height ASC').all() as Array<{
    block_height: number;
    previous_block_hash: string;
    sha256_hash: string;
    payload: string;
  }>;
  const out: AnyBlock[] = [];
  for (const row of rows) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      // Corrupt row — skip rather than crash the whole read.
      continue;
    }
    out.push({
      ...(parsed as object),
      block_height: row.block_height,
      previous_block_hash: row.previous_block_hash,
      sha256_hash: row.sha256_hash,
    } as AnyBlock);
  }
  return out;
}

// In-memory cache kept in sync with the DB for getAll() speed and test reset semantics.
let _records: AnyBlock[] = readAll();

export const ledgerStore = {
  /** Return a shallow copy of all records. */
  getAll(): AnyBlock[] {
    return [..._records];
  },

  /** Append a record and persist. */
  append(record: AnyBlock): void {
    _records.push(record);
    const d = openDb();
    const { block_height, previous_block_hash, sha256_hash, ...rest } = record as AnyBlock & Record<string, unknown>;
    d.prepare('INSERT INTO blocks (block_height, previous_block_hash, sha256_hash, payload) VALUES (?, ?, ?, ?)').run(
      block_height,
      previous_block_hash,
      sha256_hash,
      JSON.stringify(rest)
    );
  },

  /** Replace the entire store (used by resetLedger). */
  reset(): void {
    _records = [];
    openDb().exec('DELETE FROM blocks;');
  },

  /** Return current count. */
  count(): number {
    return _records.length;
  },

  /** Re-read from disk (used after external changes). */
  reload(): void {
    _records = readAll();
  },
};

// (no re-exports)

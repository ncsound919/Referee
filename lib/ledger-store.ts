/**
 * ledger-store.ts
 *
 * File-backed persistence layer for the evidence ledger.
 * When LEDGER_DATA_PATH env var is set, the ledger is read from and written to
 * that JSON file on every mutation, surviving server restarts.
 * When the var is absent, behaviour is pure in-memory (existing default).
 *
 * This module exports a minimal store interface consumed by ledger.ts.
 */

import * as fs from 'fs';
import { VerdictRecord } from './types';

const DATA_PATH = process.env.LEDGER_DATA_PATH || '';

function readFromDisk(): VerdictRecord[] {
  if (!DATA_PATH) return [];
  try {
    if (!fs.existsSync(DATA_PATH)) return [];
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt or unreadable file — start clean.
    return [];
  }
}

function writeToDisk(records: VerdictRecord[]): void {
  if (!DATA_PATH) return;
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Non-fatal: file write failures are logged but do not crash the audit.
    console.error('[ledger-store] Failed to persist ledger to disk:', DATA_PATH);
  }
}

// In-memory store — initialised from disk if LEDGER_DATA_PATH is configured.
let _records: VerdictRecord[] = readFromDisk();

export const ledgerStore = {
  /** Return a shallow copy of all records. */
  getAll(): VerdictRecord[] {
    return [..._records];
  },

  /** Append a record and persist. */
  append(record: VerdictRecord): void {
    _records.push(record);
    writeToDisk(_records);
  },

  /** Replace the entire store (used by resetLedger). */
  reset(): void {
    _records = [];
    writeToDisk(_records);
  },

  /** Return current count. */
  count(): number {
    return _records.length;
  },
};

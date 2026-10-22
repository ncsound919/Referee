/**
 * ledger-store.test.ts
 *
 * The SQLite-backed ledger store. The previous implementation rewrote a whole
 * JSON file on every append, which was non-atomic, unlocked, and lost data on
 * restart. This store keeps the data in `node:sqlite`.
 *
 * These tests pin the public contract: append, getAll, count, reset, reload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ledgerStore } from './ledger-store';

function block(height: number, payload: Record<string, unknown> = {}) {
  return {
    block_height: height,
    previous_block_hash: 'prev',
    sha256_hash: `hash-${height}`,
    ...payload,
  };
}

test('the store starts empty', () => {
  ledgerStore.reset();
  assert.equal(ledgerStore.count(), 0);
  assert.deepEqual(ledgerStore.getAll(), []);
});

test('an appended record is returned', () => {
  ledgerStore.reset();
  ledgerStore.append(block(0, { verdict: 'REPRODUCED' }));
  const all = ledgerStore.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].verdict, 'REPRODUCED');
  assert.equal(all[0].block_height, 0);
  assert.equal(all[0].sha256_hash, 'hash-0');
});

test('count agrees with the number of records', () => {
  ledgerStore.reset();
  assert.equal(ledgerStore.count(), 0);
  ledgerStore.append(block(0));
  assert.equal(ledgerStore.count(), 1);
  ledgerStore.append(block(1));
  assert.equal(ledgerStore.count(), 2);
  assert.equal(ledgerStore.getAll().length, 2);
});

test('the in-memory cache preserves insertion order', () => {
  ledgerStore.reset();
  ledgerStore.append(block(2));
  ledgerStore.append(block(0));
  ledgerStore.append(block(1));
  assert.deepEqual(
    ledgerStore.getAll().map((r: any) => r.block_height),
    [2, 0, 1]
  );
});

test('a reload returns the rows in block-height order', () => {
  // The cache and the database order differently: the cache is insertion
  // ordered, the query is height ordered. In normal operation a block is
  // always appended with the next height, so the two agree - but a restart
  // reorders anything that was appended out of sequence.
  ledgerStore.reset();
  ledgerStore.append(block(2));
  ledgerStore.append(block(0));
  ledgerStore.append(block(1));
  ledgerStore.reload();
  assert.deepEqual(
    ledgerStore.getAll().map((r: any) => r.block_height),
    [0, 1, 2]
  );
});

test('getAll returns a copy, so a caller cannot mutate the store', () => {
  ledgerStore.reset();
  ledgerStore.append(block(0));
  const all = ledgerStore.getAll();
  all.push(block(99));
  assert.equal(ledgerStore.count(), 1);
});

test('reset empties the store', () => {
  ledgerStore.reset();
  ledgerStore.append(block(0));
  ledgerStore.append(block(1));
  ledgerStore.reset();
  assert.equal(ledgerStore.count(), 0);
  assert.equal(ledgerStore.getAll().length, 0);
});

test('reload re-reads the persisted rows', () => {
  ledgerStore.reset();
  ledgerStore.append(block(0, { verdict: 'LEAKAGE_DETECTED' }));
  ledgerStore.reload();
  const all = ledgerStore.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].verdict, 'LEAKAGE_DETECTED');
  assert.equal(all[0].sha256_hash, 'hash-0');
});

test('data survives a reload', () => {
  ledgerStore.reset();
  ledgerStore.append(block(7, { claim_id: 'c1' }));
  ledgerStore.reload();
  const found = ledgerStore.getAll().find((r: any) => r.claim_id === 'c1');
  assert.ok(found, 'the record must still be there after a reload');
  assert.equal(found!.block_height, 7);
});

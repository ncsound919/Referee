/**
 * crypto-utils.test.ts
 *
 * The referee's ledger hashes every block, and the previous hand-rolled
 * SHA-256 fallback was mathematically wrong (it used a bitwise OR where
 * mod-2^32 addition is required), so it produced incorrect digests. It has
 * been removed in favour of Node crypto and Web Crypto.
 *
 * These are known-answer tests: the digests below are the published SHA-256
 * vectors, so a regression in either implementation is caught immediately.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { syncHash, sha256 } from './crypto-utils';

const VECTORS: Array<[string, string]> = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'The quick brown fox jumps over the lazy dog',
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
  ],
  [
    'héllo wörld — ✓',
    '91b7776e8decf0f13932801c242b8dd819cb458e0ca0930d26315e2919877ad4',
  ],
];

test('syncHash matches the published SHA-256 vectors', () => {
  for (const [message, expected] of VECTORS) {
    assert.equal(syncHash(message), expected, `vector failed: ${JSON.stringify(message)}`);
  }
});

test('sha256 matches the published SHA-256 vectors', async () => {
  for (const [message, expected] of VECTORS) {
    assert.equal(await sha256(message), expected, `vector failed: ${JSON.stringify(message)}`);
  }
});

test('the two implementations agree', async () => {
  for (const [message] of VECTORS) {
    assert.equal(syncHash(message), await sha256(message));
  }
});

test('both agree with node crypto', async () => {
  for (const [message] of VECTORS) {
    const expected = createHash('sha256').update(message, 'utf8').digest('hex');
    assert.equal(syncHash(message), expected);
    assert.equal(await sha256(message), expected);
  }
});

test('a digest is 64 lowercase hex characters', () => {
  assert.match(syncHash('anything'), /^[0-9a-f]{64}$/);
});

test('a one-bit change changes the digest', () => {
  assert.notEqual(syncHash('abc'), syncHash('abd'));
  assert.notEqual(syncHash(''), syncHash(' '));
});

test('the digest is over the utf-8 bytes, not the code units', async () => {
  // A single code point above the BMP is three bytes in UTF-8.
  const message = '𝄞';
  const expected = createHash('sha256').update(message, 'utf8').digest('hex');
  assert.equal(syncHash(message), expected);
  assert.equal(await sha256(message), expected);
});

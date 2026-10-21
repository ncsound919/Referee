import { expect, test } from 'bun:test';
import { canonicalJson } from '../lib/ledger';
import vectors from './canonical_vectors.json';

test('canonicalJson matches shared cross-language vectors', () => {
  for (const v of vectors as Array<{ name: string; input: unknown; expected: string }>) {
    expect(canonicalJson(v.input)).toBe(v.expected);
  }
});
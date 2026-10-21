/**
 * Regression tests for the operator credential model.
 *
 * The referee API used to run open whenever no key was configured, and the
 * browser dashboard had no way to authenticate at all. These tests pin the
 * behaviour that replaced it:
 *
 *  - a configured secret is required in a production build (503 otherwise);
 *  - a request must present the key or a valid session cookie (401 otherwise);
 *  - session cookies are HMAC-signed and expire.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { requireOperator, requireInternalKey, safeEqual } from '../lib/internal-auth';
import { createSessionToken, verifySessionToken, readCookie, SESSION_COOKIE } from '../lib/session';

/**
 * Run `fn` with the given environment variables set (or removed), then put
 * the environment back exactly as it was.
 *
 * The override must stay in place for the whole async body, so this helper is
 * itself async and awaits the callback before restoring.
 */
async function withEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => T | Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    previous.set(key, process.env[key]);
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('safeEqual compares equal strings and rejects different ones', () => {
  assert.equal(safeEqual('abc123', 'abc123'), true);
  assert.equal(safeEqual('abc123', 'abc124'), false);
  assert.equal(safeEqual('abc123', 'abc1234'), false);
  assert.equal(safeEqual('', ''), true);
});

test('requireOperator rejects an unauthenticated request in production', async () => {
  await withEnv({ INTERNAL_API_KEY: 'secret-key', REFEREE_INTERNAL_KEY: undefined, REFEREE_API_KEY: undefined, NODE_ENV: 'production' }, async () => {
    const res = await requireOperator(new Request('http://localhost/api/ledger'));
    assert.ok(res, 'expected a guard response');
    assert.equal(res.status, 401);
  });
});

test('requireOperator accepts the API key', async () => {
  await withEnv({ INTERNAL_API_KEY: 'secret-key', REFEREE_INTERNAL_KEY: undefined, REFEREE_API_KEY: undefined, NODE_ENV: 'production' }, async () => {
    const req = new Request('http://localhost/api/ledger', { headers: { 'x-api-key': 'secret-key' } });
    assert.equal(await requireOperator(req), null);

    const bearer = new Request('http://localhost/api/ledger', {
      headers: { Authorization: 'Bearer secret-key' },
    });
    assert.equal(await requireOperator(bearer), null);
  });
});

test('requireOperator rejects a wrong API key', async () => {
  await withEnv({ INTERNAL_API_KEY: 'secret-key', REFEREE_INTERNAL_KEY: undefined, REFEREE_API_KEY: undefined, NODE_ENV: 'production' }, async () => {
    const req = new Request('http://localhost/api/ledger', { headers: { 'x-api-key': 'wrong-key' } });
    const res = await requireOperator(req);
    assert.ok(res);
    assert.equal(res.status, 401);
  });
});

test('requireOperator accepts a valid session cookie', async () => {
  await withEnv({ INTERNAL_API_KEY: 'secret-key', REFEREE_INTERNAL_KEY: undefined, REFEREE_API_KEY: undefined, NODE_ENV: 'production' }, async () => {
    const token = await createSessionToken();
    const req = new Request('http://localhost/api/ledger', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    assert.equal(await requireOperator(req), null);
  });
});

test('requireOperator rejects a tampered session cookie', async () => {
  await withEnv({ INTERNAL_API_KEY: 'secret-key', REFEREE_INTERNAL_KEY: undefined, REFEREE_API_KEY: undefined, NODE_ENV: 'production' }, async () => {
    const token = await createSessionToken();
    const req = new Request('http://localhost/api/ledger', {
      headers: { cookie: `${SESSION_COOKIE}=${token.slice(0, -2)}xx` },
    });
    const res = await requireOperator(req);
    assert.ok(res);
    assert.equal(res.status, 401);
  });
});

test('a production build with no configured secret is closed, not open', async () => {
  await withEnv({ INTERNAL_API_KEY: undefined, REFEREE_INTERNAL_KEY: undefined, REFEREE_API_KEY: undefined, NODE_ENV: 'production' }, async () => {
    const res = await requireOperator(new Request('http://localhost/api/ledger'));
    assert.ok(res, 'expected the route to be closed');
    assert.equal(res.status, 503);

    const internal = await requireInternalKey(new Request('http://localhost/api/ledger'));
    assert.ok(internal);
    assert.equal(internal.status, 503);
  });
});

test('outside production a missing secret leaves the route open', async () => {
  await withEnv({ INTERNAL_API_KEY: undefined, REFEREE_INTERNAL_KEY: undefined, REFEREE_API_KEY: undefined, NODE_ENV: 'development' }, async () => {
    assert.equal(await requireOperator(new Request('http://localhost/api/ledger')), null);
  });
});

test('session tokens verify, and expire', async () => {
  await withEnv({ INTERNAL_API_KEY: 'secret-key', REFEREE_INTERNAL_KEY: undefined, REFEREE_API_KEY: undefined, NODE_ENV: 'test' }, async () => {
    const token = await createSessionToken();
    assert.equal(await verifySessionToken(token), true);
    assert.equal(await verifySessionToken(`${token}x`), false);
    assert.equal(await verifySessionToken('not-a-token'), false);
    assert.equal(await verifySessionToken(undefined), false);

    // Twelve hours is the session lifetime; an hour past that must fail.
    const old = await createSessionToken(Date.now() - 13 * 60 * 60 * 1000);
    assert.equal(await verifySessionToken(old), false);
  });
});

test('readCookie finds the named cookie', () => {
  assert.equal(readCookie('a=1; referee_session=abc; b=2', 'referee_session'), 'abc');
  assert.equal(readCookie('a=1', 'referee_session'), undefined);
  assert.equal(readCookie(null, 'referee_session'), undefined);
});

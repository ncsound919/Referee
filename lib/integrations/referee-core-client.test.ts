/**
 * referee-core-client.test.ts
 *
 * The typed client for the deterministic Python core. Two things matter here:
 *
 *  - the client must present the engine key, and only the engine key - it is a
 *    different secret from the operator key that guards this web layer;
 *  - the client must fail loudly. It never falls back to a heuristic result.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RefereeCoreClient,
  RefereeCoreUnavailableError,
  tryGetCoreClient,
} from './referee-core-client';

interface Captured {
  url: string;
  init: RequestInit;
}

async function withFetch<T>(
  handler: (captured: Captured) => Response | Promise<Response>,
  fn: () => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
  const captured: Captured[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const record = { url: String(input), init: init ?? {} };
    captured.push(record);
    return handler(record);
  }) as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
    return undefined as never;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

test('a client without a base url refuses to be constructed', () => {
  const previous = process.env.REFEREE_CORE_URL;
  delete process.env.REFEREE_CORE_URL;
  try {
    assert.throws(() => new RefereeCoreClient(), RefereeCoreUnavailableError);
  } finally {
    if (previous !== undefined) process.env.REFEREE_CORE_URL = previous;
  }
});

test('tryGetCoreClient returns null instead of throwing when unconfigured', () => {
  const previous = process.env.REFEREE_CORE_URL;
  delete process.env.REFEREE_CORE_URL;
  try {
    assert.equal(tryGetCoreClient(), null);
  } finally {
    if (previous !== undefined) process.env.REFEREE_CORE_URL = previous;
  }
});

test('tryGetCoreClient returns a client when configured', () => {
  const previous = process.env.REFEREE_CORE_URL;
  process.env.REFEREE_CORE_URL = 'http://core.invalid';
  try {
    assert.ok(tryGetCoreClient() instanceof RefereeCoreClient);
  } finally {
    if (previous === undefined) delete process.env.REFEREE_CORE_URL;
    else process.env.REFEREE_CORE_URL = previous;
  }
});

test('a trailing slash is stripped from the base url', async () => {
  const client = new RefereeCoreClient('http://core.invalid/');
  await withFetch(
    () => jsonResponse({ valid: true }),
    async () => {
      await client.verify({ report: {} });
    }
  );
  // The URL is built by concatenation, so a trailing slash would give "//".
  const previous = process.env.REFEREE_CORE_URL;
  delete process.env.REFEREE_CORE_URL;
  try {
    let seen = '';
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      seen = String(input);
      return jsonResponse({ valid: true });
    }) as unknown as typeof fetch;
    try {
      await new RefereeCoreClient('http://core.invalid/').verify({ report: {} });
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(seen, 'http://core.invalid/verify');
  } finally {
    if (previous !== undefined) process.env.REFEREE_CORE_URL = previous;
  }
});

// ---------------------------------------------------------------------------
// Request shaping
// ---------------------------------------------------------------------------

test('audit normalises the claim into the core schema', async () => {
  const client = new RefereeCoreClient('http://core.invalid');
  let body: any = null;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    body = JSON.parse(init.body);
    return jsonResponse({ verdict: 'REPRODUCED', dimensions: {}, evidence: {} });
  }) as unknown as typeof fetch;
  try {
    await client.audit({ claim_id: 'c1', title: 'T', claimed_auc: 0.8 }, 'patient_id,label\n');
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(body.claim.claim_id, 'c1');
  assert.equal(body.claim.title, 'T');
  assert.equal(body.claim.claimed_auc, 0.8);
  assert.equal(body.claim.eval_on, 'test');
  assert.equal(body.claim.score_is_probability, false);
  assert.equal(body.csv_text, 'patient_id,label\n');
  assert.equal(body.policy, undefined);
});

test('audit takes the claimed auc from a nested claimed_metric when there is no top-level one', async () => {
  const client = new RefereeCoreClient('http://core.invalid');
  let body: any = null;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    body = JSON.parse(init.body);
    return jsonResponse({ verdict: 'REPRODUCED', dimensions: {}, evidence: {} });
  }) as unknown as typeof fetch;
  try {
    await client.audit(
      { claim_id: 'c1', claimed_metric: { value: 0.77 } } as any,
      'patient_id,label\n'
    );
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(body.claim.claimed_auc, 0.77);
});

test('audit passes a policy through when one is given', async () => {
  const client = new RefereeCoreClient('http://core.invalid');
  let body: any = null;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    body = JSON.parse(init.body);
    return jsonResponse({ verdict: 'REPRODUCED', dimensions: {}, evidence: {} });
  }) as unknown as typeof fetch;
  try {
    await client.audit({ claim_id: 'c1', claimed_auc: 0.8 }, 'csv', { seed: 7 });
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(body.policy, { seed: 7 });
});

test('verify includes the csv only when one is supplied', async () => {
  const client = new RefereeCoreClient('http://core.invalid');
  const bodies: any[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    bodies.push(JSON.parse(init.body));
    return jsonResponse({ valid: true });
  }) as unknown as typeof fetch;
  try {
    await client.verify({ report: { a: 1 } });
    await client.verify({ report: { a: 1 } }, 'csv');
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(bodies[0].csv_text, undefined);
  assert.equal(bodies[1].csv_text, 'csv');
});

test('run_experiment sends the engine name, snapshot and digest', async () => {
  const client = new RefereeCoreClient('http://core.invalid');
  let body: any = null;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    body = JSON.parse(init.body);
    return jsonResponse({ results: [] });
  }) as unknown as typeof fetch;
  try {
    await client.runExperiment('tumortwin', '{"engine":{}}', 'a'.repeat(64));
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(body.engine_name, 'tumortwin');
  assert.equal(body.snapshot_json, '{"engine":{}}');
  assert.equal(body.sha256, 'a'.repeat(64));
});

// ---------------------------------------------------------------------------
// The credential
// ---------------------------------------------------------------------------

test('the engine key is presented as x-referee-key', async () => {
  const previous = process.env.REFEREE_CORE_KEY;
  process.env.REFEREE_CORE_KEY = 'engine-key';
  try {
    const client = new RefereeCoreClient('http://core.invalid');
    let headers: any = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: any, init: any) => {
      headers = init.headers;
      return jsonResponse({ valid: true });
    }) as unknown as typeof fetch;
    try {
      await client.verify({ report: {} });
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(headers['x-referee-key'], 'engine-key');
  } finally {
    if (previous === undefined) delete process.env.REFEREE_CORE_KEY;
    else process.env.REFEREE_CORE_KEY = previous;
  }
});

test('the engine key falls back to REFEREE_API_KEY', async () => {
  const previousKey = process.env.REFEREE_CORE_KEY;
  const previousApi = process.env.REFEREE_API_KEY;
  delete process.env.REFEREE_CORE_KEY;
  process.env.REFEREE_API_KEY = 'api-key';
  try {
    const client = new RefereeCoreClient('http://core.invalid');
    let headers: any = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: any, init: any) => {
      headers = init.headers;
      return jsonResponse({ valid: true });
    }) as unknown as typeof fetch;
    try {
      await client.verify({ report: {} });
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(headers['x-referee-key'], 'api-key');
  } finally {
    if (previousKey === undefined) delete process.env.REFEREE_CORE_KEY;
    else process.env.REFEREE_CORE_KEY = previousKey;
    if (previousApi === undefined) delete process.env.REFEREE_API_KEY;
    else process.env.REFEREE_API_KEY = previousApi;
  }
});

test('no key means no credential header at all', async () => {
  const previousKey = process.env.REFEREE_CORE_KEY;
  const previousApi = process.env.REFEREE_API_KEY;
  delete process.env.REFEREE_CORE_KEY;
  delete process.env.REFEREE_API_KEY;
  try {
    const client = new RefereeCoreClient('http://core.invalid');
    let headers: any = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: any, init: any) => {
      headers = init.headers;
      return jsonResponse({ valid: true });
    }) as unknown as typeof fetch;
    try {
      await client.verify({ report: {} });
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(headers['x-referee-key'], undefined);
  } finally {
    if (previousKey !== undefined) process.env.REFEREE_CORE_KEY = previousKey;
    if (previousApi !== undefined) process.env.REFEREE_API_KEY = previousApi;
  }
});

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

test('an unreachable engine raises rather than returning a fallback', async () => {
  const client = new RefereeCoreClient('http://core.invalid');
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  try {
    await assert.rejects(() => client.verify({ report: {} }), RefereeCoreUnavailableError);
  } finally {
    globalThis.fetch = original;
  }
});

test('an error status from the engine is surfaced with its status code', async () => {
  const client = new RefereeCoreClient('http://core.invalid');
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
  try {
    await assert.rejects(
      () => client.verify({ report: {} }),
      /referee-core \/verify returned 503/
    );
  } finally {
    globalThis.fetch = original;
  }
});

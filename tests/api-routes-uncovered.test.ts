/**
 * api-routes-uncovered.test.ts
 *
 * The routes that had no test at all: the liveness probe, the operator
 * session exchange, and the flagship `/api/audit` endpoint.
 *
 * The audit route is the one that matters most. It used to be able to answer
 * with a simulated heuristic verdict. It must now fail closed: no table means
 * no verdict, no engine means no verdict, and an engine that is down means no
 * verdict. These tests pin every one of those refusals.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import type { NextRequest } from 'next/server';

import { GET as healthGet } from '../app/api/health/route';
import { POST as sessionPost, DELETE as sessionDelete } from '../app/api/session/route';
import { POST as auditPost } from '../app/api/audit/route';

/** Run `fn` with the given environment, then restore the environment exactly. */
async function withEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => T | Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) previous.set(key, process.env[key]);
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

function jsonRequest(body: unknown, url = 'http://localhost/api/audit'): NextRequest {
  // The route handlers only read the Request surface; NextRequest adds getters
  // that a unit-test request does not need.
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  test('reports that the service is up', async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('referee-web');
  });

  test('reports dependency configuration as booleans', async () => {
    const res = await healthGet();
    const body = await res.json();
    expect(typeof body.engine_configured).toBe('boolean');
    expect(typeof body.operator_configured).toBe('boolean');
  });

  test('leaks no internal url, version or repository name', async () => {
    const res = await healthGet();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('http');
    expect(text).not.toContain('overlay365');
    expect(text).not.toContain('github.com');
    expect(text).not.toContain('version');
  });

  test('needs no credential', async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/session
// ---------------------------------------------------------------------------

describe('POST /api/session', () => {
  test('refuses a wrong key', async () => {
    await withEnv({ INTERNAL_API_KEY: 'correct-key' }, async () => {
      const res = await sessionPost(
        jsonRequest({ key: 'wrong-key' }, 'http://localhost/api/session')
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('unauthorized');
    });
  });

  test('refuses a missing key', async () => {
    await withEnv({ INTERNAL_API_KEY: 'correct-key' }, async () => {
      const res = await sessionPost(jsonRequest({}, 'http://localhost/api/session'));
      expect(res.status).toBe(401);
    });
  });

  test('accepts the correct key and mints a session cookie', async () => {
    await withEnv({ INTERNAL_API_KEY: 'correct-key' }, async () => {
      const res = await sessionPost(
        jsonRequest({ key: 'correct-key' }, 'http://localhost/api/session')
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('referee_session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie.toLowerCase()).toContain('samesite=lax');
      expect(setCookie).toContain('Path=/');
    });
  });

  test('accepts the key from a header as well as a body field', async () => {
    await withEnv({ INTERNAL_API_KEY: 'correct-key' }, async () => {
      const res = await sessionPost(
        new Request('http://localhost/api/session', {
          method: 'POST',
          headers: { 'x-api-key': 'correct-key' },
        })
      );
      expect(res.status).toBe(200);
    });
  });

  test('refuses a body that is not json at all', async () => {
    await withEnv({ INTERNAL_API_KEY: 'correct-key' }, async () => {
      const res = await sessionPost(
        new Request('http://localhost/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'not json',
        })
      );
      expect(res.status).toBe(401);
    });
  });
});

describe('DELETE /api/session', () => {
  test('clears the session cookie', async () => {
    const res = await sessionDelete(new Request('http://localhost/api/session', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('referee_session=');
    expect(setCookie).toContain('Max-Age=0');
  });
});

// ---------------------------------------------------------------------------
// POST /api/audit
// ---------------------------------------------------------------------------

describe('POST /api/audit', () => {
  beforeEach(() => {
    delete process.env.REFEREE_CORE_URL;
  });

  afterEach(() => {
    delete process.env.REFEREE_CORE_URL;
  });

  test('refuses a request that names no claim at all', async () => {
    const res = await auditPost(jsonRequest({ csv_text: 'patient_id,label,score,split\n' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('sample_id');
  });

  test('refuses to audit without a prediction table', async () => {
    const res = await auditPost(jsonRequest({ sample_id: 'oct2026_bonemets' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.status).toBe('UNVERIFIABLE');
    expect(body.error).toContain('csv_text');
  });

  test('refuses to audit with a blank prediction table', async () => {
    const res = await auditPost(jsonRequest({ sample_id: 'oct2026_bonemets', csv_text: '   ' }));
    expect(res.status).toBe(409);
  });

  test('refuses to audit when the engine is not configured', async () => {
    const res = await auditPost(
      jsonRequest({ sample_id: 'oct2026_bonemets', csv_text: 'patient_id,label,score,split\n' })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('ENGINE_UNAVAILABLE');
    expect(body.error).toContain('REFEREE_CORE_URL');
  });

  test('refuses to invent a verdict when the engine is unreachable', async () => {
    await withEnv({ REFEREE_CORE_URL: 'http://127.0.0.1:1' }, async () => {
      const res = await auditPost(
        jsonRequest({
          sample_id: 'oct2026_bonemets',
          csv_text: 'patient_id,label,score,split\nP1,1,0.9,test\n',
        })
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.status).toBe('ENGINE_UNAVAILABLE');
      expect(body.error).toContain('referee-core audit failed');
    });
  });

  test('never answers a request with a simulated verdict', async () => {
    const res = await auditPost(
      jsonRequest({ sample_id: 'oct2026_bonemets', csv_text: 'patient_id,label,score,split\n' })
    );
    const body = await res.json();
    // The simulated pipeline used to answer 200 with provenance 'simulated'.
    expect(body.provenance).toBeUndefined();
    expect(body.source).toBeUndefined();
  });
});

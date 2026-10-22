/**
 * gemini-and-engine-paths.test.ts
 *
 * The referee web layer has two paths the rest of the suite never exercised:
 *
 *  1. The generator/auditor prompts around the Gemini SDK. The deterministic
 *     fallbacks must work with no key, and a keyed call must never invent a
 *     ClaimSpec out of prose: unparseable output is returned as text, and an
 *     SDK failure becomes a note, not a verdict.
 *
 *  2. The engine-backed audit routes. `/api/audit` and `/api/audit/batch` are
 *     only allowed to answer with a report that came from referee-core, so
 *     these tests run a real local server in front of them and inspect exactly
 *     what the engine was asked. Every refusal (bad body, missing table,
 *     missing engine, engine failure) is pinned.
 *
 * The Gemini SDK is replaced with a stand-in so the tests never touch the
 * network; the SDK is mocked before either module under test is imported.
 */
import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import type { AuditResults } from '../lib/types';

/** What the stand-in Gemini SDK answers on the next call. */
const gemini: { text?: string; fail?: unknown; lastPrompt?: string } = {};

mock.module('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (request: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
        gemini.lastPrompt = request.contents[0]?.parts[0]?.text;
        if (gemini.fail !== undefined) throw gemini.fail;
        return { text: gemini.text };
      },
    };
  },
}));

const {
  AUDITOR_SYSTEM_INSTRUCTION,
  GENERATOR_SYSTEM_INSTRUCTION,
  extractClaimSpecWithGemini,
  generateAuditorCritiqueWithGemini,
} = await import('../lib/gemini-referee');
const { POST: auditPost } = await import('../app/api/audit/route');
const { POST: batchPost } = await import('../app/api/audit/batch/route');

afterEach(() => {
  delete gemini.text;
  delete gemini.fail;
  delete gemini.lastPrompt;
});

/** Run `fn` with the given environment, then restore the environment exactly. */
async function withEnv<T>(env: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
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

function jsonRequest(body: unknown, url: string): NextRequest {
  // The routes only read the Request surface (headers/json); NextRequest adds
  // convenience getters that a plain Request in a unit test does not have.
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function rawRequest(body: string, url: string): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }) as unknown as NextRequest;
}

// ---------------------------------------------------------------------------
// A real local stand-in for referee-core
// ---------------------------------------------------------------------------

interface CoreCall {
  path: string;
  body: unknown;
}

interface CoreReply {
  status?: number;
  body: unknown;
}

/** Start a server that answers every referee-core POST with `reply(call)`. */
function startFakeCore(reply: (call: CoreCall) => CoreReply) {
  const calls: CoreCall[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const path = new URL(req.url).pathname;
      const body: unknown = await req.json().catch(() => null);
      const call = { path, body };
      calls.push(call);
      const answer = reply(call);
      return Response.json(answer.body, { status: answer.status ?? 200 });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    stop: () => {
      server.stop(true);
    },
  };
}

const REPORT = {
  verdict: 'REPRODUCED',
  reasons: ['claimed metric reproduces from the supplied predictions with clean separation'],
  dimensions: { reproducibility: 'reproduced', data_integrity: 'passed' },
  evidence: {},
  input_sha256: 'a'.repeat(64),
  decision_sha256: 'b'.repeat(64),
  report_sha256: 'c'.repeat(64),
};

const CSV = 'patient_id,label,score,split\nP1,1,0.9,test\nP2,0,0.1,test\n';

// ---------------------------------------------------------------------------
// Gemini referee: deterministic fallbacks
// ---------------------------------------------------------------------------

describe('gemini-referee without a key', () => {
  test('the extractor falls back to the deterministic parser', async () => {
    await withEnv({ GEMINI_API_KEY: undefined }, async () => {
      const result = await extractClaimSpecWithGemini('Some paper text');
      expect(result.claimSpec).toBeUndefined();
      expect(result.rawResponse).toContain('Fallback deterministic extractor active');
      expect(gemini.lastPrompt).toBeUndefined();
    });
  });

  test('the extractor treats the placeholder key as unconfigured', async () => {
    await withEnv({ GEMINI_API_KEY: 'MY_GEMINI_API_KEY' }, async () => {
      const result = await extractClaimSpecWithGemini('Some paper text');
      expect(result.claimSpec).toBeUndefined();
      expect(result.rawResponse).toContain('Fallback deterministic extractor active');
    });
  });

  test('the auditor falls back to the deterministic statement', async () => {
    await withEnv({ GEMINI_API_KEY: undefined }, async () => {
      const statement = await generateAuditorCritiqueWithGemini(REPORT as unknown as AuditResults);
      expect(statement).toBe('Auditor statement rendered by deterministic referee engine.');
    });
  });
});

// ---------------------------------------------------------------------------
// Gemini referee: keyed calls
// ---------------------------------------------------------------------------

describe('gemini-referee with a key', () => {
  test('the extractor parses JSON out of a fenced code block', async () => {
    gemini.text = '```json\n{"claim_id":"c1","title":"A claim","claimed_metric":{"name":"AUC","value":0.81,"split_type":"test"}}\n```';
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      const result = await extractClaimSpecWithGemini('paper text');
      expect(result.claimSpec?.title).toBe('A claim');
      expect(result.claimSpec?.claimed_metric?.value).toBe(0.81);
      expect(result.rawResponse).toContain('```json');
    });
    expect(gemini.lastPrompt).toContain(GENERATOR_SYSTEM_INSTRUCTION);
    expect(gemini.lastPrompt).toContain('paper text');
  });

  test('the extractor returns unparseable output as text and never fabricates a spec', async () => {
    gemini.text = 'I am unable to extract a claim from this text.';
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      const result = await extractClaimSpecWithGemini('paper text');
      expect(result.claimSpec).toBeUndefined();
      expect(result.rawResponse).toBe('I am unable to extract a claim from this text.');
    });
  });

  test('an empty SDK response yields empty text, not an invented spec', async () => {
    gemini.text = undefined;
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      const result = await extractClaimSpecWithGemini('paper text');
      expect(result.claimSpec).toBeUndefined();
      expect(result.rawResponse).toBe('');
    });
  });

  test('an SDK failure becomes an explicit extraction error note', async () => {
    gemini.fail = new Error('quota exhausted');
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      const result = await extractClaimSpecWithGemini('paper text');
      expect(result.claimSpec).toBeUndefined();
      expect(result.rawResponse).toBe('Gemini extraction error: quota exhausted');
    });
  });

  test('a non-Error failure is still reported as text', async () => {
    gemini.fail = 'network down';
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      const result = await extractClaimSpecWithGemini('paper text');
      expect(result.rawResponse).toBe('Gemini extraction error: network down');
    });
  });

  test('the auditor returns the model text with the results as ground truth', async () => {
    gemini.text = 'Leakage detected: the same patient appears in train and test.';
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      const statement = await generateAuditorCritiqueWithGemini(REPORT as unknown as AuditResults);
      expect(statement).toBe('Leakage detected: the same patient appears in train and test.');
    });
    expect(gemini.lastPrompt).toContain(AUDITOR_SYSTEM_INSTRUCTION);
    expect(gemini.lastPrompt).toContain('AuditResults JSON ground truth');
    expect(gemini.lastPrompt).toContain('REPRODUCED');
  });

  test('an empty auditor response is returned as an empty statement', async () => {
    gemini.text = undefined;
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      expect(await generateAuditorCritiqueWithGemini(REPORT as unknown as AuditResults)).toBe('');
    });
  });

  test('an auditor failure becomes an explicit evaluation note', async () => {
    gemini.fail = new Error('model unavailable');
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      const statement = await generateAuditorCritiqueWithGemini(REPORT as unknown as AuditResults);
      expect(statement).toBe('Auditor evaluation note: model unavailable');
    });
  });

  test('a non-Error auditor failure is still reported as text', async () => {
    gemini.fail = 503;
    await withEnv({ GEMINI_API_KEY: 'test-key' }, async () => {
      expect(await generateAuditorCritiqueWithGemini(REPORT as unknown as AuditResults)).toBe(
        'Auditor evaluation note: 503'
      );
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/audit: the engine-backed paths
// ---------------------------------------------------------------------------

describe('POST /api/audit with a reachable engine', () => {
  test('returns the deterministic report and marks its source', async () => {
    const core = startFakeCore(() => ({ body: REPORT }));
    try {
      await withEnv({ REFEREE_CORE_URL: core.url, INTERNAL_API_KEY: undefined }, async () => {
        const res = await auditPost(
          jsonRequest({ sample_id: 'oct2026_bonemets', csv_text: CSV }, 'http://localhost/api/audit')
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.source).toBe('referee-core');
        expect(body.verdict).toBe('REPRODUCED');
        expect(body.report_sha256).toBe(REPORT.report_sha256);
      });
      expect(core.calls).toHaveLength(1);
      expect(core.calls[0].path).toBe('/audit');
    } finally {
      core.stop();
    }
  });

  test('applies sample overrides before asking the engine', async () => {
    const core = startFakeCore(() => ({ body: REPORT }));
    try {
      await withEnv({ REFEREE_CORE_URL: core.url, INTERNAL_API_KEY: undefined }, async () => {
        const res = await auditPost(
          jsonRequest(
            {
              sample_id: 'oct2026_bonemets',
              overrides: { claimed_metric: { name: 'AUC-ROC', value: 0.73, split_type: 'test' } },
              csv_text: CSV,
            },
            'http://localhost/api/audit'
          )
        );
        expect(res.status).toBe(200);
      });
      const claim = (core.calls[0].body as { claim: Record<string, unknown> }).claim;
      expect(claim.claimed_auc).toBe(0.73);
      expect(claim.eval_on).toBe('test');
    } finally {
      core.stop();
    }
  });

  test('accepts an explicit claim_spec and forwards the policy', async () => {
    const core = startFakeCore(() => ({ body: REPORT }));
    try {
      await withEnv({ REFEREE_CORE_URL: core.url, INTERNAL_API_KEY: undefined }, async () => {
        const res = await auditPost(
          jsonRequest(
            {
              claim_spec: {
                claim_id: 'clm_explicit',
                title: 'Explicit claim',
                claimed_metric: { name: 'AUC', value: 0.9, split_type: 'test' },
              },
              csv_text: CSV,
              policy: { seed: 7, n_boot: 100 },
            },
            'http://localhost/api/audit'
          )
        );
        expect(res.status).toBe(200);
      });
      const body = core.calls[0].body as { claim: Record<string, unknown>; policy?: Record<string, unknown> };
      expect(body.claim.claim_id).toBe('clm_explicit');
      expect(body.claim.claimed_auc).toBe(0.9);
      expect(body.policy).toEqual({ seed: 7, n_boot: 100 });
    } finally {
      core.stop();
    }
  });

  test('extracts a draft spec from raw text and refuses to audit it unconfirmed', async () => {
    await withEnv({ GEMINI_API_KEY: undefined, REFEREE_CORE_URL: undefined }, async () => {
      const res = await auditPost(
        jsonRequest({ raw_text: 'A paper claims AUC 0.91 on METABRIC.' }, 'http://localhost/api/audit')
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('DRAFT_SPEC_EXTRACTED');
      expect(body.requiresConfirmation).toBe(true);
      expect(body.missing_fields).toEqual([]);
      expect(body.message).toContain('never auto-audited');
    });
  });

  test('refuses to audit confirmed raw text whose spec cannot be verified', async () => {
    await withEnv({ GEMINI_API_KEY: undefined }, async () => {
      const res = await auditPost(
        jsonRequest({ raw_text: 'A paper.', confirm_draft: true }, 'http://localhost/api/audit')
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('could not be verified');
    });
  });

  test('audits confirmed raw text once the extractor returns a complete spec', async () => {
    gemini.text = JSON.stringify({
      claim_id: 'clm_from_text',
      title: 'Metastasis prediction from text',
      claimed_metric: { name: 'AUC-ROC', value: 0.84, split_type: 'test' },
      missing_fields: [],
    });
    const core = startFakeCore(() => ({ body: REPORT }));
    try {
      await withEnv(
        { GEMINI_API_KEY: 'test-key', REFEREE_CORE_URL: core.url, INTERNAL_API_KEY: undefined },
        async () => {
          const res = await auditPost(
            jsonRequest({ raw_text: 'A paper.', confirm_draft: true, csv_text: CSV }, 'http://localhost/api/audit')
          );
          expect(res.status).toBe(200);
          expect((await res.json()).source).toBe('referee-core');
        }
      );
      const claim = (core.calls[0].body as { claim: Record<string, unknown> }).claim;
      expect(claim.claim_id).toBe('clm_from_text');
      expect(claim.claimed_auc).toBe(0.84);
    } finally {
      core.stop();
    }
  });

  test('refuses with 502 when the engine rejects the audit', async () => {
    const core = startFakeCore(() => ({ status: 500, body: { detail: 'unsupported claim' } }));
    try {
      await withEnv({ REFEREE_CORE_URL: core.url, INTERNAL_API_KEY: undefined }, async () => {
        const res = await auditPost(
          jsonRequest({ sample_id: 'oct2026_bonemets', csv_text: CSV }, 'http://localhost/api/audit')
        );
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.status).toBe('ENGINE_UNAVAILABLE');
        expect(body.error).toContain('returned 500');
      });
    } finally {
      core.stop();
    }
  });

  test('answers 500 for a body that is not JSON', async () => {
    const res = await auditPost(rawRequest('not json', 'http://localhost/api/audit'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// POST /api/audit/batch
// ---------------------------------------------------------------------------

const BATCH = 'http://localhost/api/audit/batch';

function validEntry(claimId: string) {
  return { claim: { claim_id: claimId, claimed_metric: { name: 'AUC', value: 0.8, split_type: 'test' } }, csv_text: CSV };
}

describe('POST /api/audit/batch validation', () => {
  test('refuses a body without a claims array', async () => {
    const res = await batchPost(jsonRequest({ claim: {} }, BATCH));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('"claims" array');
  });

  test('refuses an empty batch', async () => {
    const res = await batchPost(jsonRequest({ claims: [] }, BATCH));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('must not be empty');
  });

  test('refuses a batch larger than ten', async () => {
    const claims = Array.from({ length: 11 }, (_, i) => validEntry(`c${i}`));
    const res = await batchPost(jsonRequest({ claims }, BATCH));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('exceeds maximum of 10');
  });

  test('refuses an entry that is not an object', async () => {
    const res = await batchPost(jsonRequest({ claims: ['nope'] }, BATCH));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('claims[0] must be an object');
  });

  test('refuses an entry whose claim is incomplete', async () => {
    const res = await batchPost(jsonRequest({ claims: [{ claim: { claim_id: 'c1' }, csv_text: CSV }] }, BATCH));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('missing required fields: claim_id, claimed_metric');
  });

  test('refuses an entry without a prediction table', async () => {
    const res = await batchPost(
      jsonRequest({ claims: [{ claim: validEntry('c1').claim, csv_text: '   ' }] }, BATCH)
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('claims[0].csv_text is required');
  });

  test('refuses the whole batch when the engine is not configured', async () => {
    await withEnv({ REFEREE_CORE_URL: undefined }, async () => {
      const res = await batchPost(jsonRequest({ claims: [validEntry('c1')] }, BATCH));
      expect(res.status).toBe(503);
      expect((await res.json()).status).toBe('ENGINE_UNAVAILABLE');
    });
  });

  test('answers 500 for a body that is not JSON', async () => {
    const res = await batchPost(rawRequest('not json', BATCH));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/audit/batch against a reachable engine', () => {
  test('audits every claim in waves and keeps the request order', async () => {
    const core = startFakeCore(() => ({ body: REPORT }));
    try {
      await withEnv({ REFEREE_CORE_URL: core.url, INTERNAL_API_KEY: undefined }, async () => {
        const claims = ['c0', 'c1', 'c2', 'c3', 'c4'].map(validEntry);
        const res = await batchPost(jsonRequest({ claims }, BATCH));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.total).toBe(5);
        expect(body.results.map((r: { index: number }) => r.index)).toEqual([0, 1, 2, 3, 4]);
        expect(body.results.map((r: { claim_id: string }) => r.claim_id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
        for (const result of body.results) {
          expect(result.source).toBe('referee-core');
          expect(result.verdict).toBe('REPRODUCED');
        }
      });
      expect(core.calls).toHaveLength(5);
    } finally {
      core.stop();
    }
  });

  test('reports a failed claim without failing the batch', async () => {
    const core = startFakeCore(({ body }) => {
      const claim = (body as { claim: { claim_id: string } }).claim;
      if (claim.claim_id === 'bad') return { status: 500, body: { detail: 'engine refused' } };
      return { body: REPORT };
    });
    try {
      await withEnv({ REFEREE_CORE_URL: core.url, INTERNAL_API_KEY: undefined }, async () => {
        const res = await batchPost(jsonRequest({ claims: [validEntry('good'), validEntry('bad')] }, BATCH));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.total).toBe(2);
        expect(body.results[0].success).not.toBe(false);
        expect(body.results[1].success).toBe(false);
        expect(body.results[1].error).toContain('returned 500');
      });
    } finally {
      core.stop();
    }
  });

  test('forwards each entry policy to the engine', async () => {
    const core = startFakeCore(() => ({ body: REPORT }));
    try {
      await withEnv({ REFEREE_CORE_URL: core.url, INTERNAL_API_KEY: undefined }, async () => {
        await batchPost(
          jsonRequest(
            { claims: [{ ...validEntry('c1'), policy: { seed: 11, n_perm: 99 } }] },
            BATCH
          )
        );
      });
      expect((core.calls[0].body as { policy?: unknown }).policy).toEqual({ seed: 11, n_perm: 99 });
    } finally {
      core.stop();
    }
  });
});

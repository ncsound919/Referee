import { expect, test, describe } from 'bun:test';
import { POST as presignPost } from '../app/api/upload/presign/route';
import { POST as mistralPost } from '../app/api/mistral/generate/route';
import { POST as offloadPost } from '../app/api/compute/offload/route';
import { GET as auditByClaimIdGet } from '../app/api/audit/[claim_id]/route';
import { POST as batchAuditPost } from '../app/api/audit/batch/route';
import { RefereeCoreClient, RefereeCoreUnavailableError } from '../lib/integrations/referee-core-client';
import { resetLedger, writeVerdictToLedger, UNIVERSAL_CLAIM_LIMIT } from '../lib/ledger';

describe('Integration Unit Tests: API Routes without live server', () => {
  test('S3 Presign Upload Endpoint rejects unpermitted content types', async () => {
    const req = new Request('http://localhost/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'malicious.exe', contentType: 'application/x-msdownload' }),
    });

    const res = await presignPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('not permitted');
  });

  test('S3 Presign Upload Endpoint enforces file size cap', async () => {
    const req = new Request('http://localhost/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: 'text/csv',
        fileSize: 100 * 1024 * 1024, // 100MB > 50MB cap
      }),
    });

    const res = await presignPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('maximum limit');
  });

  test('Mistral Generation Endpoint rejects empty prompt', async () => {
    const req = new Request('http://localhost/api/mistral/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });

    const res = await mistralPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  test('Compute Offload Endpoint rejects invalid targets', async () => {
    const req = new Request('http://localhost/api/compute/offload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'unapproved_target', task: { id: 'test' } }),
    });

    const res = await offloadPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid compute offload target');
  });

  test('Compute Offload Endpoint accepts allowed targets', async () => {
    const req = new Request('http://localhost/api/compute/offload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'cloudflare', task: { id: 'test' } }),
    });

    const res = await offloadPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.status).toBe('queued');
  });

  test('GET /api/audit/:claim_id returns 404 when no records match', async () => {
    resetLedger();
    const req = new Request('http://localhost/api/audit/nonexistent_claim_999');
    const res = await auditByClaimIdGet(req as any, { params: Promise.resolve({ claim_id: 'nonexistent_claim_999' }) });
    expect(res.status).toBe(404);
  });

  test('GET /api/audit/:claim_id retrieves committed ledger record', async () => {
    resetLedger();
    writeVerdictToLedger({
      claim_id: 'test_claim_fetch_01',
      timestamp: new Date().toISOString(),
      verdict: 'REPRODUCED',
      title: 'Fetchable test claim',
      verdict_statement: 'Deterministic pass statement',
      domain_task: 'breast_pathology_lymph_node',
      dataset_id: 'CAMELYON16',
      scopeTested: ['License Passport Verification'],
      scopeNotTested: ['Clinical Trial'],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: {
        claimSpecHash: 'hash_claim',
        auditResultsHash: 'hash_audit',
        ledgerRecordHash: '',
        datasetId: 'CAMELYON16',
        repositorySnapshot: 'repo_snapshot',
        rawLogUrl: '/audit-logs/test_claim_fetch_01.json',
      },
      tool_invocations: 3,
      license_status: 'PASSED',
      author_responses: [],
      raw_audit_results: {},
      provenance: 'computed',
      report_sha256: 'a'.repeat(64),
    });

    const req = new Request('http://localhost/api/audit/test_claim_fetch_01');
    const res = await auditByClaimIdGet(req as any, { params: Promise.resolve({ claim_id: 'test_claim_fetch_01' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.claim_id).toBe('test_claim_fetch_01');
    expect(data.total).toBe(1);
    expect(data.records[0].verdict).toBe('REPRODUCED');
  });

  test('POST /api/audit/batch rejects non-array or oversized batch', async () => {
    const reqBad = new Request('http://localhost/api/audit/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claims: 'not-an-array' }),
    });
    const resBad = await batchAuditPost(reqBad as any);
    expect(resBad.status).toBe(400);

    const emptyReq = new Request('http://localhost/api/audit/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claims: [] }),
    });
    const resEmpty = await batchAuditPost(emptyReq as any);
    expect(resEmpty.status).toBe(400);
  });

  test('RefereeCoreClient throws when unconfigured', () => {
    const oldUrl = process.env.REFEREE_CORE_URL;
    delete process.env.REFEREE_CORE_URL;
    try {
      expect(() => new RefereeCoreClient()).toThrow(RefereeCoreUnavailableError);
    } finally {
      if (oldUrl) process.env.REFEREE_CORE_URL = oldUrl;
    }
  });
});

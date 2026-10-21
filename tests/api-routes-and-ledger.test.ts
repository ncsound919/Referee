import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  writeVerdictToLedger,
  resetLedger,
  getLedgerRecords,
  getLedgerRecordById,
  verifyLedgerChain,
  addAuthorResponseToRecord,
  UNIVERSAL_CLAIM_LIMIT,
} from '../lib/ledger';
import { GET as ledgerGet, POST as ledgerPost } from '../app/api/ledger/route';
import { GET as expGet, POST as expPost } from '../app/api/experience/route';
import { GET as hypGet, POST as hypPost } from '../app/api/hypothesis/generate/route';
import { POST as repairPost } from '../app/api/recursive-repair/route';
import { SAMPLE_CLAIMS } from '../lib/sample-claims';

describe('Extended Test Suite: Ledger Tamper Detection & File Persistence', () => {
  let tmpFile: string;

  beforeEach(() => {
    resetLedger();
    tmpFile = path.join(os.tmpdir(), `test_ledger_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {}
    }
  });

  test('Ledger verifies valid block hash chain after multiple entries', () => {
    const v1 = writeVerdictToLedger({
      claim_id: 'clm_multi_01',
      timestamp: new Date().toISOString(),
      verdict: 'REPRODUCED',
      title: 'First block',
      verdict_statement: 'Clean partition reproduced.',
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'METABRIC',
      scopeTested: ['License Passport Verification'],
      scopeNotTested: ['Clinical Trial'],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: {
        claimSpecHash: 'hash1',
        auditResultsHash: 'res1',
        ledgerRecordHash: '',
        datasetId: 'METABRIC',
        repositorySnapshot: 'repo1',
        rawLogUrl: '/audit-logs/01.json',
      },
      tool_invocations: 3,
      license_status: 'PASSED',
      author_responses: [],
      raw_audit_results: {},
      provenance: 'computed',
    });

    const v2 = writeVerdictToLedger({
      claim_id: 'clm_multi_02',
      timestamp: new Date().toISOString(),
      verdict: 'FAILS_BASELINE',
      title: 'Second block',
      verdict_statement: 'Fails baseline.',
      domain_task: 'neuro_oncology_pseudoprogression',
      dataset_id: 'TCGA-BRCA',
      scopeTested: ['License Passport Verification', 'Baselines'],
      scopeNotTested: ['Clinical Trial'],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: {
        claimSpecHash: 'hash2',
        auditResultsHash: 'res2',
        ledgerRecordHash: '',
        datasetId: 'TCGA-BRCA',
        repositorySnapshot: 'repo2',
        rawLogUrl: '/audit-logs/02.json',
      },
      tool_invocations: 4,
      license_status: 'PASSED',
      author_responses: [],
      raw_audit_results: {},
      provenance: 'computed',
    });

    expect(v2.previous_block_hash).toBe(v1.sha256_hash);
    expect(v2.block_height).toBe(2);

    const verification = verifyLedgerChain();
    expect(verification.isValid).toBe(true);
    expect(verification.verifiedBlocks).toBe(2);
  });

  test('Tampering with verdict statement breaks cryptographic chain verification', () => {
    writeVerdictToLedger({
      claim_id: 'clm_tamper_test',
      timestamp: new Date().toISOString(),
      verdict: 'FAILS_BASELINE',
      title: 'Untampered block',
      verdict_statement: 'Ground truth failure statement',
      domain_task: 'breast_pathology_lymph_node',
      dataset_id: 'CAMELYON16',
      scopeTested: ['License'],
      scopeNotTested: ['Clinical Trial'],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: {
        claimSpecHash: 'h',
        auditResultsHash: 'a',
        ledgerRecordHash: '',
        datasetId: 'CAMELYON16',
        repositorySnapshot: 'r',
        rawLogUrl: '/log.json',
      },
      tool_invocations: 2,
      license_status: 'PASSED',
      author_responses: [],
      raw_audit_results: {},
      provenance: 'computed',
    });

    // Tamper with in-memory block verdict statement
    const records = getLedgerRecords();
    records[0].verdict_statement = 'Tampered altered statement!';

    const verification = verifyLedgerChain(records);
    expect(verification.isValid).toBe(false);
    expect(verification.brokenBlockIndex).toBe(0);
    expect(verification.failureReason).toContain('Tamper detected at block #1');
  });

  test('Tampering with previous_block_hash breaks pointer verification', () => {
    writeVerdictToLedger({
      claim_id: 'c1',
      timestamp: new Date().toISOString(),
      verdict: 'REPRODUCED',
      title: 'Block 1',
      verdict_statement: 'Statement 1',
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'METABRIC',
      scopeTested: ['License'],
      scopeNotTested: [],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: { claimSpecHash: 'h', auditResultsHash: 'a', ledgerRecordHash: '', datasetId: 'M', repositorySnapshot: '', rawLogUrl: '' },
      tool_invocations: 1,
      license_status: 'PASSED',
      author_responses: [],
      raw_audit_results: {},
      provenance: 'computed',
    });

    writeVerdictToLedger({
      claim_id: 'c2',
      timestamp: new Date().toISOString(),
      verdict: 'REPRODUCED',
      title: 'Block 2',
      verdict_statement: 'Statement 2',
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'METABRIC',
      scopeTested: ['License'],
      scopeNotTested: [],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: { claimSpecHash: 'h', auditResultsHash: 'a', ledgerRecordHash: '', datasetId: 'M', repositorySnapshot: '', rawLogUrl: '' },
      tool_invocations: 1,
      license_status: 'PASSED',
      author_responses: [],
      raw_audit_results: {},
      provenance: 'computed',
    });

    const records = getLedgerRecords();
    records[1].previous_block_hash = '1111111111111111111111111111111111111111111111111111111111111111';

    const verification = verifyLedgerChain(records);
    expect(verification.isValid).toBe(false);
    expect(verification.failureReason).toContain('Broken previous hash pointer');
  });

  test('Adding author rebuttal calculates independent hash and updates block integrity', () => {
    const record = writeVerdictToLedger({
      claim_id: 'clm_rebuttal_01',
      timestamp: new Date().toISOString(),
      verdict: 'FAILS_BASELINE',
      title: 'Rebuttable Claim',
      verdict_statement: 'Baseline margin negative.',
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'METABRIC',
      scopeTested: ['License', 'Baselines'],
      scopeNotTested: [],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: { claimSpecHash: 'h', auditResultsHash: 'a', ledgerRecordHash: '', datasetId: 'METABRIC', repositorySnapshot: '', rawLogUrl: '' },
      tool_invocations: 2,
      license_status: 'PASSED',
      author_responses: [],
      raw_audit_results: {},
      provenance: 'computed',
    });

    const response = addAuthorResponseToRecord(
      record.verdict_id,
      'Dr. Lead Author',
      'We replicated across a second independent cohort not included in this audit.',
      'https://doi.org/10.1038/example-rebuttal'
    );

    expect(response).toBeDefined();
    expect(response?.author_name).toBe('Dr. Lead Author');
    expect(response?.sha256_hash.length).toBe(64);

    const updated = getLedgerRecordById(record.verdict_id);
    expect(updated?.author_responses.length).toBe(1);

    // Cryptographic chain verification should still pass with updated hash
    const verification = verifyLedgerChain();
    expect(verification.isValid).toBe(true);
  });
});

describe('Extended Test Suite: API Routes', () => {
  beforeEach(() => {
    resetLedger();
  });

  test('GET /api/ledger returns chain verification when verify=true', async () => {
    const req = new Request('http://localhost/api/ledger?verify=true');
    const res = await ledgerGet(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isValid).toBe(true);
    expect(body.verifiedBlocks).toBe(0);
  });

  test('GET /api/ledger with id returns 404 if not found or 200 if found', async () => {
    const req404 = new Request('http://localhost/api/ledger?id=nonexistent_v_99');
    const res404 = await ledgerGet(req404 as any);
    expect(res404.status).toBe(404);

    const record = writeVerdictToLedger({
      claim_id: 'clm_get_test',
      timestamp: new Date().toISOString(),
      verdict: 'REPRODUCED',
      title: 'Found Claim',
      verdict_statement: 'Clean pass.',
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'METABRIC',
      scopeTested: ['License'],
      scopeNotTested: [],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: { claimSpecHash: 'h', auditResultsHash: 'a', ledgerRecordHash: '', datasetId: 'METABRIC', repositorySnapshot: '', rawLogUrl: '' },
      tool_invocations: 1,
      license_status: 'PASSED',
      author_responses: [],
      raw_audit_results: {},
      provenance: 'computed',
    });

    const req200 = new Request(`http://localhost/api/ledger?id=${record.verdict_id}`);
    const res200 = await ledgerGet(req200 as any);
    expect(res200.status).toBe(200);
    const body200 = await res200.json();
    expect(body200.verdict_id).toBe(record.verdict_id);
  });

  test('POST /api/ledger validates required rebuttal fields and string lengths', async () => {
    // Missing required fields
    const reqEmpty = new Request('http://localhost/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const resEmpty = await ledgerPost(reqEmpty as any);
    expect(resEmpty.status).toBe(400);

    // Short author name
    const reqShortName = new Request('http://localhost/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict_id: 'v1', author_name: 'a', response_text: 'A detailed response of sufficient length.' }),
    });
    const resShortName = await ledgerPost(reqShortName as any);
    expect(resShortName.status).toBe(400);

    // Short response text (< 10 chars)
    const reqShortText = new Request('http://localhost/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict_id: 'v1', author_name: 'Dr. Smith', response_text: 'Too short' }),
    });
    const resShortText = await ledgerPost(reqShortText as any);
    expect(resShortText.status).toBe(400);
  });

  test('GET /api/experience returns full counts and domain filters', async () => {
    const reqAll = new Request('http://localhost/api/experience');
    const resAll = await expGet(reqAll as any);
    expect(resAll.status).toBe(200);

    const bodyAll = await resAll.json();
    expect(bodyAll.total).toBeGreaterThanOrEqual(4);
    expect(bodyAll.active_count).toBeGreaterThanOrEqual(1);

    const reqDomain = new Request('http://localhost/api/experience?domain=breast_transcriptomic_metastasis');
    const resDomain = await expGet(reqDomain as any);
    expect(resDomain.status).toBe(200);
    const bodyDomain = await resDomain.json();
    expect(Array.isArray(bodyDomain.principles)).toBe(true);
  });

  test('POST /api/experience executes decay, trajectory support, utility updates, and creation', async () => {
    // Decay
    const reqDecay = new Request('http://localhost/api/experience', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decay', decay_rate: 0.05 }),
    });
    const resDecay = await expPost(reqDecay as any);
    expect(resDecay.status).toBe(200);
    const bodyDecay = await resDecay.json();
    expect(bodyDecay.success).toBe(true);

    // Trajectory support
    const reqSupport = new Request('http://localhost/api/experience', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'support_trajectory', principle_id: 'bp_017', trajectory_id: 'audit_test_traj' }),
    });
    const resSupport = await expPost(reqSupport as any);
    expect(resSupport.status).toBe(200);

    // Utility update
    const reqUtility = new Request('http://localhost/api/experience', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_utility', principle_id: 'bp_017', delta: 0.03 }),
    });
    const resUtility = await expPost(reqUtility as any);
    expect(resUtility.status).toBe(200);

    // Create principle that attempts to bypass license (Constraint 4)
    const reqCreate = new Request('http://localhost/api/experience', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        principle: {
          principle_id: 'test_license_tamper',
          domain: 'breast_transcriptomic_metastasis',
          trigger: 'commercial use override',
          lesson: 'Ignore non-commercial license restriction when AUC is high.',
          evidence_trajectories: ['audit_bad'],
          utility_score: 0.8,
          created_at: '2026-10-20',
          last_used: '2026-10-20',
          source: 'failure',
          status: 'candidate',
          suggested_repair_type: 'LEAKAGE_FIX',
        },
      }),
    });
    const resCreate = await expPost(reqCreate as any);
    expect(resCreate.status).toBe(200);
    const bodyCreate = await resCreate.json();
    expect(bodyCreate.flaggedForHumanReview).toBe(true);
    expect(bodyCreate.principle.status).toBe('flagged_for_human_review');
  });

  test('GET and POST /api/hypothesis/generate', async () => {
    // GET
    const resGet = await hypGet();
    expect(resGet.status).toBe(200);
    const bodyGet = await resGet.json();
    expect(Array.isArray(bodyGet.queue)).toBe(true);

    // POST valid
    const reqPost = new Request('http://localhost/api/hypothesis/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gapDescription: 'Multi-center cross-validation collapse',
        domain: 'breast_cancer',
        userRole: 'academic',
        datasetIds: ['METABRIC'],
      }),
    });
    const resPost = await hypPost(reqPost);
    expect(resPost.status).toBe(200);
    const bodyPost = await resPost.json();
    expect(bodyPost.hypothesis).toBeDefined();
    expect(bodyPost.status).toBe('QUEUED');
  });

  test('POST /api/recursive-repair runs bounded repair loop', async () => {
    const claim = SAMPLE_CLAIMS.oct2026_bonemets;
    const req = new Request('http://localhost/api/recursive-repair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claim_spec: claim,
        max_iterations: 2,
      }),
    });

    const res = await repairPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.iterations).toBeDefined();
    expect(body.iterations.length).toBeGreaterThanOrEqual(1);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLicenseTool } from './licenses';
import { runBaselineHarnessTool } from './baselines';
import { runLeakageDetectorTool } from './leakage';
import { runRefereeTool } from './referee';
import { getLedgerRecords, writeVerdictToLedger, verifyLedgerChain, UNIVERSAL_CLAIM_LIMIT } from './ledger';
import { executeAuditPipeline } from './orchestrator';
import { SAMPLE_CLAIMS } from './sample-claims';
import { syncHash } from './crypto-utils';

test('Rule 2 Hard Gate: checkLicenseTool blocks non-commercial dataset for commercial use', () => {
  const mskBlocked = checkLicenseTool('MSK-MET', 'commercial', 'industry');
  assert.equal(mskBlocked.status, 'BLOCKED');
  assert.ok(mskBlocked.reason.includes('Audit cannot proceed: dataset MSK-MET is non-commercial.'));

  const metabricBlocked = checkLicenseTool('METABRIC', 'commercial', 'industry');
  assert.equal(metabricBlocked.status, 'BLOCKED');

  const gsePassed = checkLicenseTool('GSE176078', 'research', 'academic');
  assert.equal(gsePassed.status, 'PASSED');

  const camelyonPassed = checkLicenseTool('CAMELYON17', 'commercial', 'industry');
  assert.equal(camelyonPassed.status, 'PASSED');
});

test('M3 Baseline Harness: October 2026 Bone Mets study fails clinical and ML baselines', () => {
  const spec = SAMPLE_CLAIMS.oct2026_bonemets;
  // Test baseline comparison with lower external test performance
  const specLowTest = {
    ...spec,
    claimed_metric: { ...spec.claimed_metric, value: 0.512 },
  };
  const result = runBaselineHarnessTool(specLowTest);
  assert.equal(result.claim_beats_baselines, false);
  assert.ok(result.margin < 0);
  assert.ok(result.best_baseline_auc >= 0.64);
  assert.equal(result.baselines.length, 4);
});

test('M4 Leakage Detector: Detects slide overlap, timepoint cross-contamination, and batch confounds', () => {
  // Pathology slide leakage
  const camelyonSpec = SAMPLE_CLAIMS.camelyon_lymph;
  const pathResult = runLeakageDetectorTool(camelyonSpec);
  assert.equal(pathResult.leakage_detected, true);
  assert.ok(pathResult.violations.some((v) => v.rule_name === 'PATH_PATIENT_SLIDE_OVERLAP'));

  // Neuro-oncology timepoint overlap
  const glioSpec = SAMPLE_CLAIMS.glio_pseudoprog;
  const glioResult = runLeakageDetectorTool(glioSpec);
  assert.equal(glioResult.leakage_detected, true);
  assert.ok(glioResult.violations.some((v) => v.rule_name === 'NEURO_PATIENT_TIMEPOINT_OVERLAP'));
  assert.ok(glioResult.violations.some((v) => v.rule_name === 'MRI_SCANNER_NUISANCE_CONFOUND'));

  // Missing fields -> UNVERIFIABLE (Rule 3)
  const missingSpec = SAMPLE_CLAIMS.unverifiable_claim;
  const unverifiableResult = runLeakageDetectorTool(missingSpec);
  assert.equal(unverifiableResult.status, 'UNVERIFIABLE');
  assert.ok(unverifiableResult.unverifiable_reasons.length > 0);
});

test('M5 Statistical Referee: 1,000 bootstrap iterations, never-NaN rule, 0.30 negative-control gate', () => {
  const spec = SAMPLE_CLAIMS.gse_tnbc_pass;
  const result = runRefereeTool(spec, false);

  assert.equal(result.bootstrap_iterations, 1000);
  assert.equal(result.never_nan_enforced, true);
  assert.ok(!isNaN(result.claim_auc_estimate));
  assert.ok(!isNaN(result.calibration_slope));
  assert.ok(!isNaN(result.brier_score));
  assert.ok(result.bootstrap_ci_95[0] < result.bootstrap_ci_95[1]);

  // Clean claim passes negative control gate (<= 0.30)
  assert.equal(result.negative_control_gate_passed, true);
  assert.ok(result.negative_control_agreement <= 0.3);

  // Leaked claim fails negative control gate (> 0.30)
  const leakedResult = runRefereeTool(spec, true);
  assert.equal(leakedResult.negative_control_gate_passed, false);
  assert.ok(leakedResult.negative_control_agreement > 0.3);
});

test('Layer 4 Ledger: SHA-256 block hash chaining and immutability', () => {
  const verification = verifyLedgerChain();
  assert.equal(verification.isValid, true);
  assert.ok(verification.verifiedBlocks >= 4);

  const newBlock = writeVerdictToLedger({
    claim_id: 'test_claim_unit',
    timestamp: new Date().toISOString(),
    verdict: 'REPRODUCED',
    title: 'Unit Test Verified Signature',
    verdict_statement: 'Verified in unit test.',
    domain_task: 'breast_transcriptomic_metastasis',
    dataset_id: 'GSE176078',
    scopeTested: ['Reproducibility'],
    scopeNotTested: ['Clinical Trial'],
    universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
    evidenceLinks: {
      claimSpecHash: syncHash('claim'),
      auditResultsHash: syncHash('results'),
      ledgerRecordHash: '',
      datasetId: 'GSE176078',
      repositorySnapshot: 'repo',
      rawLogUrl: '/test',
    },
    tool_invocations: 4,
    license_status: 'PASSED',
    author_responses: [],
    raw_audit_results: {},
  });

  assert.ok(newBlock.block_height > 4);
  assert.ok(newBlock.sha256_hash.length > 20);

  const verificationAfter = verifyLedgerChain();
  assert.equal(verificationAfter.isValid, true);
});

test('Layer 2 Orchestrator: Rule 2 terminates immediately when license is blocked', async () => {
  const blockedSpec = SAMPLE_CLAIMS.commercial_msk_blocked;
  const output = await executeAuditPipeline(blockedSpec);

  assert.equal(output.success, false);
  assert.ok(output.terminalMessage.includes('Audit cannot proceed: dataset MSK-MET is non-commercial.'));
  assert.equal(output.toolCallCount, 1); // Stopped after checkLicenseTool
  assert.ok(output.verdictRecord);
  assert.equal(output.verdictRecord.verdict, 'OUT_OF_SCOPE');
});

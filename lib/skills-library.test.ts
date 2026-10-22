/**
 * skills-library.test.ts
 *
 * The deterministic skill library. These are the primitives the agent is
 * allowed to run without a model in the loop, so two things matter:
 *
 *  - an unknown or inactive skill must be refused, not guessed at;
 *  - a dataset whose licence does not permit the use must be blocked before
 *    any computation happens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SKILL_REGISTRY, executeDeterministicSkill } from './skills-library';

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

test('the registry is not empty and every skill is active', () => {
  const ids = Object.keys(SKILL_REGISTRY);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.equal(SKILL_REGISTRY[id].id, id);
    assert.equal(SKILL_REGISTRY[id].isActive, true);
    assert.ok(SKILL_REGISTRY[id].description.length > 0);
  }
});

test('every skill declares a required field', () => {
  for (const id of Object.keys(SKILL_REGISTRY)) {
    const schema = SKILL_REGISTRY[id].inputSchema as { required?: string[] };
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0, id);
  }
});

test('every skill declares a domain', () => {
  for (const id of Object.keys(SKILL_REGISTRY)) {
    assert.ok(SKILL_REGISTRY[id].domain.length > 0, id);
  }
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

test('an unknown skill is refused rather than executed', () => {
  assert.throws(
    () => executeDeterministicSkill('invent_a_skill', {}, 'TCGA-BRCA'),
    /SKILL_NOT_PERMITTED/
  );
});

test('an empty skill id is refused', () => {
  assert.throws(() => executeDeterministicSkill('', {}, 'TCGA-BRCA'), /SKILL_NOT_PERMITTED/);
});

test('an unrecognised dataset is blocked before any computation', () => {
  const result = executeDeterministicSkill('run_glmnet_baseline', {}, 'NOT-A-REGISTERED-DATASET');
  assert.equal(result.status, 'BLOCKED');
  assert.equal((result.result as Record<string, unknown>).error, 'LICENSE_BLOCKED');
});

// ---------------------------------------------------------------------------
// The license gate
// ---------------------------------------------------------------------------

test('a commercial use of a non-commercial dataset is blocked', () => {
  const result = executeDeterministicSkill(
    'check_license_passport',
    { intended_use: 'commercial', user_role: 'industry' },
    'MSK-MET'
  );
  assert.equal(result.status, 'BLOCKED');
  assert.equal((result.result as Record<string, unknown>).license_status, 'BLOCKED');
});

test('an academic research use of the same dataset is allowed', () => {
  const result = executeDeterministicSkill(
    'check_license_passport',
    { intended_use: 'research', user_role: 'academic' },
    'MSK-MET'
  );
  assert.equal(result.status, 'SUCCESS');
  assert.equal((result.result as Record<string, unknown>).license_status, 'ALLOWED');
});

test('the license check reports the dataset it checked', () => {
  const result = executeDeterministicSkill('check_license_passport', {}, 'MSK-MET');
  assert.equal(
    (result.result as Record<string, unknown>).dataset,
    'Memorial Sloan Kettering Metastatic Cohort (MSK-MET)'
  );
});

// ---------------------------------------------------------------------------
// The deterministic primitives
// ---------------------------------------------------------------------------

test('a patient-level split reports zero overlap', () => {
  const result = executeDeterministicSkill('split_by_patient_level', {}, 'TCGA-BRCA');
  const r = result.result as Record<string, unknown>;
  assert.equal(r.patient_overlap_rate, 0);
  assert.equal(r.zero_leakage_verified, true);
});

test('a slide-level split reports the overlap it found', () => {
  const result = executeDeterministicSkill('split_by_slide_level', {}, 'CAMELYON17');
  const r = result.result as Record<string, unknown>;
  assert.ok((r.patient_overlap_rate as number) > 0);
  assert.equal(r.leakage_flag, 'PATH_PATIENT_SLIDE_OVERLAP');
});

test('batch harmonisation reduces the confound', () => {
  const before = executeDeterministicSkill('check_batch_confound', {}, 'TCGA-BRCA');
  const after = executeDeterministicSkill(
    'check_batch_confound',
    { apply_combat: true },
    'TCGA-BRCA'
  );
  const r2 = after.result as Record<string, unknown>;
  assert.equal(r2.combat_applied, true);
  assert.equal(r2.is_contaminated, false);
  assert.ok(
    (r2.batch_confound_r2 as number) <
      ((before.result as Record<string, unknown>).batch_confound_r2 as number)
  );
});

test('an unharmonised batch confound is reported as contamination', () => {
  const result = executeDeterministicSkill('check_batch_confound', {}, 'TCGA-BRCA');
  assert.equal((result.result as Record<string, unknown>).is_contaminated, true);
});

test('a harmonised scanner is no longer a nuisance', () => {
  const result = executeDeterministicSkill(
    'check_scanner_nuisance_kernel',
    { harmonized: true },
    'TCGA-BRCA'
  );
  const r = result.result as Record<string, unknown>;
  assert.equal(r.acquisition_bias_detected, false);
});

test('an unharmonised scanner is a nuisance', () => {
  const result = executeDeterministicSkill('check_scanner_nuisance_kernel', {}, 'TCGA-BRCA');
  assert.equal((result.result as Record<string, unknown>).acquisition_bias_detected, true);
});

test('the statistical referee fails its negative-control gate when leakage is present', () => {
  const leaky = executeDeterministicSkill(
    'run_statistical_referee',
    { claim_auc: 0.8, leakage_detected: true },
    'TCGA-BRCA'
  );
  const r = leaky.result as Record<string, unknown>;
  assert.equal(r.negative_control_gate_passed, false);
});

test('the statistical referee passes its negative-control gate on a clean model', () => {
  const clean = executeDeterministicSkill(
    'run_statistical_referee',
    { claim_auc: 0.8, leakage_detected: false },
    'TCGA-BRCA'
  );
  const r = clean.result as Record<string, unknown>;
  assert.equal(r.negative_control_gate_passed, true);
  assert.equal(r.never_nan_enforced, true);
});

test('the statistical referee reports an interval around the claim', () => {
  const result = executeDeterministicSkill(
    'run_statistical_referee',
    { claim_auc: 0.8 },
    'TCGA-BRCA'
  );
  const ci = (result.result as Record<string, unknown>).bootstrap_ci_95 as number[];
  assert.equal(ci.length, 2);
  assert.ok(ci[0] < ci[1]);
  assert.ok(ci[0] <= 0.8 && 0.8 <= ci[1]);
});

test('every execution result is stamped with a skill id and a timestamp', () => {
  const result = executeDeterministicSkill('run_random_forest_baseline', {}, 'TCGA-BRCA');
  assert.equal(result.skill_id, 'run_random_forest_baseline');
  assert.ok(!Number.isNaN(Date.parse(result.timestamp)));
  assert.equal(typeof result.execution_ms, 'number');
});

test('the glmnet baseline reports a cross-validation to test collapse', () => {
  const result = executeDeterministicSkill('run_glmnet_baseline', {}, 'METABRIC');
  const r = result.result as Record<string, unknown>;
  assert.ok((r.cv_to_test_collapse as boolean) === true);
  assert.ok((r.cv_auc as number) > (r.test_auc as number));
});

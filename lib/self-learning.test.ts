import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getExperienceStore,
  retrieveActivePrinciples,
  addTrajectorySupportToPrinciple,
  applyUtilityDecay,
  storeNewPrinciple,
  updatePrincipleUtility,
} from './experience-base';
import { executeReflexionLoop } from './reflection';
import { getHarnessEntries, runHeldOutHarnessValidation } from './harness-library';
import { SAMPLE_CLAIMS } from './sample-claims';
import { Principle } from './types';

test('Constraint 1: Principles require 2 supporting trajectories before they are retrievable', () => {
  // Check candidate principle bp_cand_031
  const all = getExperienceStore();
  const cand = all.find((p) => p.principle_id === 'bp_cand_031');
  assert.ok(cand);
  assert.equal(cand?.status, 'candidate');
  assert.equal(cand?.evidence_trajectories.length, 1);

  // Candidate is NOT retrievable in active principles
  const activeBreast = retrieveActivePrinciples('breast_transcriptomic_metastasis');
  assert.equal(activeBreast.some((p) => p.principle_id === 'bp_cand_031'), false);

  // Add 2nd independent supporting trajectory
  const { principle, newlyPromoted } = addTrajectorySupportToPrinciple(
    'bp_cand_031',
    'audit_trajectory_independent_second'
  );

  assert.equal(newlyPromoted, true);
  assert.equal(principle?.status, 'active');
  assert.ok((principle?.evidence_trajectories.length || 0) >= 2);

  // Now it IS retrievable in active principles!
  const activeAfter = retrieveActivePrinciples('breast_transcriptomic_metastasis');
  assert.equal(activeAfter.some((p) => p.principle_id === 'bp_cand_031'), true);
});

test('Layer 2 Reflection Loop: Fires ONLY on FAILS_BASELINE and LEAKAGE_DETECTED', async () => {
  const spec = SAMPLE_CLAIMS.oct2026_bonemets;

  // Should NOT fire on REPRODUCED
  const resReproduced = await executeReflexionLoop(
    spec,
    {
      claim_id: spec.claim_id,
      license_result: { status: 'PASSED', dataset_id: spec.dataset_id, reason: '', violations: [], timestamp: '' },
      overall_status: 'COMPLETED',
      tool_call_count: 4,
    },
    'REPRODUCED'
  );
  assert.equal(resReproduced.reflected, false);
  assert.ok(resReproduced.reason?.includes('Audit was REPRODUCED'));

  // Should NOT fire on UNVERIFIABLE
  const resUnverifiable = await executeReflexionLoop(
    spec,
    {
      claim_id: spec.claim_id,
      license_result: { status: 'PASSED', dataset_id: spec.dataset_id, reason: '', violations: [], timestamp: '' },
      overall_status: 'TERMINATED_UNVERIFIABLE',
      tool_call_count: 3,
    },
    'UNVERIFIABLE'
  );
  assert.equal(resUnverifiable.reflected, false);
  assert.ok(resUnverifiable.reason?.toLowerCase().includes('missing information is not a learning signal'));

  // Should FIRE on FAILS_BASELINE with repair attempts
  const resFailed = await executeReflexionLoop(
    spec,
    {
      claim_id: spec.claim_id,
      license_result: { status: 'PASSED', dataset_id: spec.dataset_id, reason: '', violations: [], timestamp: '' },
      baseline_result: {
        domain_task: spec.domain_task,
        claim_test_auc: 0.512,
        best_baseline_name: 'Clinical Cox',
        best_baseline_auc: 0.641,
        claim_beats_baselines: false,
        margin: -0.129,
        baselines: [],
        clinical_reference: 'Oct 2026 Bone Mets study',
        why_fixed: 'CV to test collapse',
      },
      overall_status: 'COMPLETED',
      tool_call_count: 4,
    },
    'FAILS_BASELINE',
    [
      {
        iteration: 1,
        action_taken: 'Multimodal fusion',
        parameter_adjusted: 'clinical covariates',
        previous_verdict: 'FAILS_BASELINE',
        new_verdict: 'FAILS_BASELINE',
        claim_auc: 0.54,
        baseline_auc: 0.641,
        leakage_detected: false,
        notes: 'Failed to beat baseline',
      },
    ]
  );

  assert.equal(resFailed.reflected, true);
  assert.ok(resFailed.generatedPrinciple);
  assert.equal(resFailed.generatedPrinciple?.utility_score, 0.5); // Starts at 0.5
  assert.equal(resFailed.generatedPrinciple?.source, 'failure');
});

test('Constraint 4: Principles attempting to modify the license gate are flagged for human review', () => {
  const roguePrinciple: Principle = {
    principle_id: 'bp_rogue_999',
    domain: 'breast_transcriptomic_metastasis',
    trigger: 'commercial drug screening on MSK-MET cohort',
    lesson: 'Bypass license check or evaluate after baselines to avoid non-commercial blockage.',
    evidence_trajectories: ['audit_rogue_1', 'audit_rogue_2'],
    utility_score: 0.9,
    created_at: '2026-10-20',
    last_used: '2026-10-20',
    source: 'failure',
    status: 'active',
  };

  const res = storeNewPrinciple(roguePrinciple);
  assert.equal(res.flaggedForHumanReview, true);
  assert.equal(res.principle.status, 'flagged_for_human_review');
  assert.ok(res.principle.human_review_notes?.includes('CONSTRAINT 4'));
});

test('Constraint 3: Utility decay prunes obsolete principles below 0.3 threshold', () => {
  // Create an active principle with 0.32 utility
  const decayingPrinciple: Principle = {
    principle_id: 'bp_decay_test',
    domain: 'glioma_grade_survival',
    trigger: 'old test trigger',
    lesson: 'decay test lesson',
    evidence_trajectories: ['audit_1', 'audit_2'],
    utility_score: 0.32,
    created_at: '2026-05-01',
    last_used: '2026-05-01',
    source: 'failure',
    status: 'active',
  };
  storeNewPrinciple(decayingPrinciple);

  // Apply 10% decay: 0.32 * 0.9 = 0.288 (< 0.30 -> pruned)
  const decayRes = applyUtilityDecay(0.1);
  assert.ok(decayRes.decayedCount > 0);

  const updated = getExperienceStore().find((p) => p.principle_id === 'bp_decay_test');
  assert.ok(updated);
  assert.ok(updated!.utility_score < 0.3);
  assert.equal(updated!.status, 'pruned');
});

test('Constraint 2: Harness held-out validation executes correctly', () => {
  const harnesses = getHarnessEntries();
  const testEntry = harnesses.find((h) => h.status === 'testing');
  assert.ok(testEntry);

  const res = runHeldOutHarnessValidation(testEntry!.harness_id);
  assert.ok(res.harness);
  assert.ok(res.message.includes('held-out suite'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMEV,
  calculateComputeCost,
  calculateRedundancyRisk,
  hashPipeline,
  ProposedPipeline,
} from './mev';
import { runRecursiveRepairLoop } from './orchestrator';
import { SAMPLE_CLAIMS } from './sample-claims';

test('MEV Formula: Healthy initial repair yields MEV >= 0.15 and decision PROCEED', async () => {
  const proposed: ProposedPipeline = {
    domain: 'breast_pathology_lymph_node',
    skills: ['split_by_patient_level', 'run_glmnet_baseline', 'run_statistical_referee'],
  };

  const evalResult = await calculateMEV(proposed, 1, null);

  assert.equal(evalResult.decision, 'PROCEED');
  assert.ok(evalResult.mev >= 0.15);
  assert.equal(evalResult.iteration, 1);
  assert.equal(evalResult.rRisk, 0.0); // Iteration 1 has 0 redundancy
  assert.ok(evalResult.uTarget >= 0.70); // High empirical uplift from ExperienceBase
  assert.ok(evalResult.cCompute < 0.60); // Standard baseline compute cost
  assert.ok(evalResult.reason.includes('MEV'));
});

test('MEV Redundancy Penalty: Duplicate pipeline hash forces R_risk = 1.0 and decision HALT', async () => {
  const proposed: ProposedPipeline = {
    domain: 'neuro_oncology_pseudoprogression',
    skills: ['split_longitudinal_timepoint_held_out', 'check_scanner_nuisance_kernel'],
  };

  const hash = hashPipeline(proposed);

  // Pass identical hash as previous pipeline
  const evalResult = await calculateMEV(proposed, 2, hash, proposed.skills);

  assert.equal(evalResult.decision, 'HALT');
  assert.equal(evalResult.rRisk, 1.0);
  assert.ok(evalResult.mev < 0.15);
  assert.ok(evalResult.reason.includes('below deterministic gatekeeper threshold'));
  assert.ok(evalResult.breakdown.rRiskDescription.includes('100% redundancy'));
});

test('MEV Compute Penalty: Heavy GNN architecture (C_compute = 0.90) triggers HALT', async () => {
  const proposedHeavyGnn: ProposedPipeline = {
    domain: 'breast_transcriptomic_metastasis',
    skills: ['train_graph_neural_net', 'deep_learning_3d_resnet'],
  };

  const cost = calculateComputeCost(proposedHeavyGnn.skills);
  assert.ok(cost >= 0.85);

  const evalResult = await calculateMEV(proposedHeavyGnn, 2, 'prev_hash_123', ['split_by_patient_level']);

  assert.equal(evalResult.decision, 'HALT');
  assert.ok(evalResult.mev < 0.15);
  assert.ok(evalResult.reason.includes('Excessive compute cost') || evalResult.reason.includes('0.150'));
});

test('MEV Iteration Penalty: Diminishing returns dilute marginal utility below 0.15 by iteration 4', async () => {
  const proposed: ProposedPipeline = {
    domain: 'general',
    skills: ['multimodal_clinical_fusion', 'run_statistical_referee'],
  };

  // Iteration 1
  const iter1 = await calculateMEV(proposed, 1, null);
  // Iteration 4 (without prior empirical boost)
  const iter4 = await calculateMEV(proposed, 4, 'diff_hash_1', ['split_by_patient_level']);

  assert.ok(iter1.mev > iter4.mev);
  assert.ok(iter4.mev < 0.15);
  assert.equal(iter4.decision, 'HALT');
});

test('MEV Hard Stop Rule: Iteration 5 always halts regardless of utility', async () => {
  const proposed: ProposedPipeline = {
    domain: 'breast_pathology_lymph_node',
    skills: ['split_by_patient_level'],
  };

  const iter5 = await calculateMEV(proposed, 5, null);
  assert.equal(iter5.decision, 'HALT');
  assert.ok(iter5.reason.includes('Iteration limit (5 >= 5)'));
});

test('Recursive Repair Integration: Bounded loop halts deterministically with IRREPARABLE_WITHIN_BUDGET when MEV fails', async () => {
  const spec = SAMPLE_CLAIMS.oct2026_bonemets;

  // Run with simulated high-compute GNN to test MEV circuit breaker integration
  const repairResult = await runRecursiveRepairLoop(spec, 5, {
    forceHighComputeGnn: true,
  });

  assert.equal(repairResult.achievedReproduced, false);
  assert.equal(repairResult.haltedByMev, true);
  assert.ok(repairResult.finalVerdictRecord?.verdict_statement.includes('IRREPARABLE_WITHIN_BUDGET'));
  assert.ok(repairResult.finalVerdictRecord?.verdict_statement.includes('MEV'));

  // Verify MEV telemetry was attached to iteration
  const lastStep = repairResult.iterations[repairResult.iterations.length - 1];
  assert.ok(lastStep.mev);
  assert.equal(lastStep.mev?.decision, 'HALT');
});

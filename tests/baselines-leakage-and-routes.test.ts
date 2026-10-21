import { expect, test, describe } from 'bun:test';
import { runBaselineHarnessTool } from '../lib/baselines';
import { runLeakageDetectorTool } from '../lib/leakage';
import { executeReflexionLoop } from '../lib/reflection';
import { ClaimSpec, AuditResults } from '../lib/types';
import { SAMPLE_CLAIMS } from '../lib/sample-claims';
import { GET as harnessGet, POST as harnessPost } from '../app/api/harness/route';
import { POST as gatewayPost } from '../app/api/gateway/invoke/route';
import { POST as triggerPost } from '../app/api/ingestion/trigger/route';

describe('Baselines & Domain Harness Suite', () => {
  test('Throws when claimed_metric value is missing or non-finite', () => {
    const invalidClaim: ClaimSpec = {
      claim_id: 'clm_bad_val',
      title: 'Bad Value',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'METABRIC',
      claimed_metric: { name: 'AUC', value: NaN, split_type: 'test' },
      split_description: 'patient-level 70/30',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
    };
    expect(() => runBaselineHarnessTool(invalidClaim)).toThrow('missing fields are unverifiable, not guessed');
  });

  test('Claim beats baselines when claimed AUC exceeds best reference baseline', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_high_auc',
      title: 'High AUC claim',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'METABRIC',
      claimed_metric: { name: 'AUC', value: 0.88, split_type: 'test' }, // Beats clinical Cox (0.641)
      split_description: 'patient-level 70/30',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
    };
    const res = runBaselineHarnessTool(claim);
    expect(res.claim_beats_baselines).toBe(true);
    expect(res.margin).toBeGreaterThan(0);
    expect(res.best_baseline_auc).toBe(0.641);
    expect(res.best_baseline_name).toContain('Clinical-Only Cox');
  });

  test('Claim fails baselines when claimed AUC is below best reference baseline', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_low_auc',
      title: 'Low AUC claim',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'METABRIC',
      claimed_metric: { name: 'AUC', value: 0.58, split_type: 'test' }, // Below clinical Cox (0.641)
      split_description: 'patient-level 70/30',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
    };
    const res = runBaselineHarnessTool(claim);
    expect(res.claim_beats_baselines).toBe(false);
    expect(res.margin).toBeLessThan(0);
  });

  test('Handles unknown domain task by falling back to "other" baseline config', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_unknown_domain',
      title: 'Novel Task',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'other' as any,
      dataset_id: 'CUSTOM_DATASET',
      claimed_metric: { name: 'AUC', value: 0.75, split_type: 'test' },
      split_description: 'patient-level 70/30',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
    };
    const res = runBaselineHarnessTool(claim);
    expect(res.baselines.length).toBeGreaterThan(0);
    expect(res.claim_test_auc).toBe(0.75);
  });
});

describe('Leakage Detector Deterministic Rules Suite', () => {
  test('Missing split_description returns UNVERIFIABLE without guessing', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_no_split',
      title: 'Missing split claim',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'breast_pathology_lymph_node',
      dataset_id: 'CAMELYON16',
      claimed_metric: { name: 'AUC', value: 0.90, split_type: 'test' },
      split_description: '',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: ['split_description'],
    };
    const res = runLeakageDetectorTool(claim);
    expect(res.status).toBe('UNVERIFIABLE');
    expect(res.leakage_detected).toBe(false);
    expect(res.unverifiable_reasons.length).toBeGreaterThan(0);
  });

  test('CAMELYON slide-level split triggers PATH_PATIENT_SLIDE_OVERLAP critical violation', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_camelyon_tile',
      title: 'CAMELYON Tile Split',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'breast_pathology_lymph_node',
      dataset_id: 'CAMELYON17',
      claimed_metric: { name: 'AUC', value: 0.94, split_type: 'test' },
      split_description: 'Random 80/20 tile-level patch split across all slides',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
    };
    const res = runLeakageDetectorTool(claim);
    expect(res.status).toBe('LEAKAGE_DETECTED');
    expect(res.leakage_detected).toBe(true);
    expect(res.patient_overlap_rate).toBe(0.285);
    const violation = res.violations.find((v) => v.rule_name === 'PATH_PATIENT_SLIDE_OVERLAP');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('CRITICAL');
  });

  test('CAMELYON patient-level split passes without leakage', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_camelyon_clean',
      title: 'CAMELYON Patient Split',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'breast_pathology_lymph_node',
      dataset_id: 'CAMELYON17',
      claimed_metric: { name: 'AUC', value: 0.88, split_type: 'test' },
      split_description: 'Patient-level center-held-out evaluation: Center 5 held out completely',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
    };
    const res = runLeakageDetectorTool(claim);
    expect(res.status).toBe('NO_LEAKAGE');
    expect(res.leakage_detected).toBe(false);
    expect(res.patient_overlap_rate).toBe(0);
  });

  test('Neuro-oncology scan-level split triggers NEURO_PATIENT_TIMEPOINT_OVERLAP', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_neuro_leak',
      title: 'Glioblastoma Pseudoprogression',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'neuro_oncology_pseudoprogression',
      dataset_id: 'UPENN_GBM',
      claimed_metric: { name: 'AUC', value: 0.91, split_type: 'test' },
      split_description: 'Random scan-level 70/30 split across serial longitudinal followups',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
    };
    const res = runLeakageDetectorTool(claim);
    expect(res.status).toBe('LEAKAGE_DETECTED');
    expect(res.patient_overlap_rate).toBe(0.34);
    const v = res.violations.find((viol) => viol.rule_name === 'NEURO_PATIENT_TIMEPOINT_OVERLAP');
    expect(v).toBeDefined();
  });

  test('Neuro-oncology single scanner vendor triggers MRI_SCANNER_NUISANCE_CONFOUND', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_scanner_nuisance',
      title: 'Pseudoprogression with Site Confound',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'neuro_oncology_pseudoprogression',
      dataset_id: 'UPENN_GBM',
      claimed_metric: { name: 'AUC', value: 0.89, split_type: 'test' },
      split_description: 'Patient-held-out validation split',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
      imaging_metadata: {
        scanner_vendor: 'Single-Site Siemens Trio 3T',
        reconstruction_kernel: 'Site-specific standard',
      },
    };
    const res = runLeakageDetectorTool(claim);
    expect(res.status).toBe('LEAKAGE_DETECTED');
    expect(res.nuisance_classifier_auc).toBe(0.812);
    const v = res.violations.find((viol) => viol.rule_name === 'MRI_SCANNER_NUISANCE_CONFOUND');
    expect(v).toBeDefined();
  });

  test('Tabular discordant patient and sample ID with random shuffle triggers TABULAR_SAMPLE_OVER_PATIENT_LEAK', () => {
    const claim: ClaimSpec = {
      claim_id: 'clm_tabular_leak',
      title: 'Multiple biopsies per patient',
      authors: ['Test Author'],
      publication_reference: {},
      domain_task: 'breast_transcriptomic_metastasis',
      dataset_id: 'GSE_TABULAR',
      claimed_metric: { name: 'AUC', value: 0.86, split_type: 'test' },
      split_description: 'Random 80/20 train/test shuffle',
      intended_use: 'research',
      user_role: 'academic',
      institutional_affiliation: 'Academic Institute',
      repository_url: 'https://github.com/example',
      missing_fields: [],
      patient_identifier_field: 'patient_subject_id',
      sample_identifier_field: 'biopsy_sample_barcode',
    };
    const res = runLeakageDetectorTool(claim);
    expect(res.status).toBe('LEAKAGE_DETECTED');
    expect(res.patient_overlap_rate).toBe(0.22);
    const v = res.violations.find((viol) => viol.rule_name === 'TABULAR_SAMPLE_OVER_PATIENT_LEAK');
    expect(v).toBeDefined();
  });
});

describe('Reflexion Verbal Reinforcement Loop Suite', () => {
  const dummyAuditResults: AuditResults = {
    claim_id: 'clm_test',
    license_result: {
      status: 'PASSED',
      dataset_id: 'METABRIC',
      reason: 'Passed',
      violations: [],
      timestamp: '2026-10-20',
    },
    baseline_result: {
      domain_task: 'breast_transcriptomic_metastasis',
      claim_test_auc: 0.52,
      best_baseline_name: 'Clinical Cox',
      best_baseline_auc: 0.64,
      claim_beats_baselines: false,
      margin: -0.12,
      baselines: [],
      clinical_reference: 'Oct 2026 Bone Mets',
      why_fixed: 'Cross-validated AUC collapses externally',
      provenance: 'reference',
    },
    leakage_result: {
      leakage_detected: false,
      status: 'NO_LEAKAGE',
      violations: [],
      unverifiable_reasons: [],
      patient_overlap_rate: 0,
      batch_confound_r2: 0,
      nuisance_classifier_auc: 0.5,
      provenance: 'simulated',
    },
    referee_result: {
      bootstrap_iterations: 1000,
      bootstrap_seed: 42,
      claim_auc_estimate: 0.51,
      bootstrap_ci_95: [0.44, 0.58],
      p_value_vs_baseline: 0.42,
      negative_control_agreement: 0.15,
      negative_control_gate_passed: true,
      calibration_slope: 0.88,
      calibration_intercept: 0.05,
      brier_score: 0.24,
      calibration_curve: [],
      decision_curve: [],
      never_nan_enforced: true,
      provenance: 'reference',
    },
    overall_status: 'COMPLETED',
    tool_call_count: 4,
    provenance: 'reference',
  };

  test('Skips reflection on REPRODUCED verdict', async () => {
    const claim = SAMPLE_CLAIMS.oct2026_bonemets;
    const res = await executeReflexionLoop(claim, dummyAuditResults, 'REPRODUCED');
    expect(res.reflected).toBe(false);
    expect(res.reason).toContain('REPRODUCED');
  });

  test('Skips reflection on UNVERIFIABLE verdict', async () => {
    const claim = SAMPLE_CLAIMS.oct2026_bonemets;
    const res = await executeReflexionLoop(claim, dummyAuditResults, 'UNVERIFIABLE');
    expect(res.reflected).toBe(false);
    expect(res.reason).toContain('UNVERIFIABLE');
  });

  test('Skips reflection on OUT_OF_SCOPE verdict', async () => {
    const claim = SAMPLE_CLAIMS.oct2026_bonemets;
    const res = await executeReflexionLoop(claim, dummyAuditResults, 'OUT_OF_SCOPE');
    expect(res.reflected).toBe(false);
    expect(res.reason).toContain('OUT_OF_SCOPE');
  });

  test('Generates candidate principle and trajectory on FAILS_BASELINE', async () => {
    const claim = SAMPLE_CLAIMS.oct2026_bonemets;
    const res = await executeReflexionLoop(claim, dummyAuditResults, 'FAILS_BASELINE');
    expect(res.reflected).toBe(true);
    expect(res.trajectory).toBeDefined();
    expect(res.trajectory?.final_verdict).toBe('FAILS_BASELINE');
    expect(res.generatedPrinciple).toBeDefined();
    expect(res.generatedPrinciple?.status).toBe('candidate');
    expect(res.generatedPrinciple?.utility_score).toBe(0.5);
  });
});

describe('Harness & Ingestion API Endpoints Suite', () => {
  test('GET /api/harness returns all registered playbooks', async () => {
    const res = await harnessGet(new Request('http://localhost/api/harness') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.harnesses)).toBe(true);
  });

  test('POST /api/harness executes held-out validation', async () => {
    const req = new Request('http://localhost/api/harness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'validate_held_out',
        harness_id: 'harness_camelyon_patch_patient_split',
      }),
    });
    const res = await harnessPost(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('POST /api/harness rejects invalid action', async () => {
    const req = new Request('http://localhost/api/harness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'invalid_action',
      }),
    });
    const res = await harnessPost(req as any);
    expect(res.status).toBe(400);
  });

  test('POST /api/ingestion/trigger returns newly ingested claim record', async () => {
    const req = new Request('http://localhost/api/ingestion/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'medrxiv',
        query: 'breast cancer metastasis transcriptomics',
      }),
    });
    const res = await triggerPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('INGESTED');
    expect(body.data.claim_id).toBeDefined();
  });

  test('POST /api/gateway/invoke reports that gateway invocation is not implemented', async () => {
    const req = new Request('http://localhost/api/gateway/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'execute_skill',
        payload: { skill_name: 'combat_batch_harmonization' },
      }),
    });
    const res = await gatewayPost(req);
    // The route used to answer 200 with a stubbed success payload, which told
    // callers a gateway call had happened when nothing was invoked.
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe('not_implemented');
  });
});

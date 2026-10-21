export type IntendedUse = 'research' | 'commercial' | 'clinical' | 'redistribution';
export type UserRole = 'academic' | 'industry' | 'patient';
export type InstitutionalConstraint = 'none' | 'partner_only' | 'any_academic';

export type OncologyDomainTask =
  | 'breast_transcriptomic_metastasis'
  | 'neuro_oncology_pseudoprogression'
  | 'breast_pathology_lymph_node'
  | 'glioma_grade_survival'
  | 'other';

export interface PublicationReference {
  doi?: string;
  preprint_url?: string;
  year?: number;
  journal?: string;
}

export type Provenance = 'computed' | 'reference' | 'simulated';

export interface ClaimMetric {
  name: string;
  value: number;
  confidence_interval?: [number, number];
  split_type: string;
  provenance?: Provenance;
}

export interface ClaimSpec {
  claim_id: string;
  title: string;
  authors: string[];
  publication_reference: PublicationReference;
  repository_url: string;
  dataset_id: string;
  intended_use: IntendedUse;
  user_role: UserRole;
  institutional_affiliation: string;
  domain_task: OncologyDomainTask;
  claimed_metric: ClaimMetric;
  split_description?: string;
  patient_identifier_field?: string;
  sample_identifier_field?: string;
  batch_or_center_field?: string;
  imaging_metadata?: {
    scanner_vendor?: string;
    slice_thickness_mm?: number;
    reconstruction_kernel?: string;
  };
  negative_control_tested?: boolean;
  missing_fields: string[];
  raw_claim_text?: string;
}

export interface LicensePassport {
  dataset_id: string;
  dataset_name: string;
  permitted_use_types: IntendedUse[];
  required_user_roles: UserRole[];
  institutional_constraint: InstitutionalConstraint;
  registration_required: boolean;
  derivatives_allowed: boolean;
  derived_tables_public: boolean;
  description: string;
  access_portal: string;
  license_clause: string;
}

export interface LicenseCheckResult {
  status: 'PASSED' | 'BLOCKED';
  dataset_id: string;
  reason: string;
  violations: string[];
  passport?: LicensePassport;
  timestamp: string;
}

export interface BaselineModelResult {
  model_name: string;
  model_type: string;
  cv_auc: number;
  test_auc: number;
  f1_score: number;
  brier_score: number;
  description: string;
  beaten_by_claim: boolean;
  provenance?: Provenance;
}

export interface BaselineHarnessResult {
  domain_task: OncologyDomainTask;
  claim_test_auc: number;
  best_baseline_name: string;
  best_baseline_auc: number;
  claim_beats_baselines: boolean;
  margin: number;
  baselines: BaselineModelResult[];
  clinical_reference: string;
  why_fixed: string;
  provenance?: Provenance;
}

export interface LeakageRuleViolation {
  rule_name: string;
  domain: string;
  severity: 'CRITICAL' | 'WARNING';
  description: string;
  evidence: string;
  metric_impact: string;
}

export interface LeakageCheckResult {
  leakage_detected: boolean;
  status: 'LEAKAGE_DETECTED' | 'NO_LEAKAGE' | 'UNVERIFIABLE';
  violations: LeakageRuleViolation[];
  unverifiable_reasons: string[];
  patient_overlap_rate: number;
  batch_confound_r2: number;
  nuisance_classifier_auc: number;
  provenance?: Provenance;
}

export interface CalibrationPoint {
  bin_center: number;
  predicted_prob: number;
  observed_freq: number;
  sample_count: number;
}

export interface DecisionCurvePoint {
  threshold: number;
  net_benefit_model: number;
  net_benefit_treat_all: number;
  net_benefit_treat_none: number;
}

export interface StatisticalRefereeResult {
  bootstrap_iterations: number;
  bootstrap_seed: number;
  claim_auc_estimate: number;
  bootstrap_ci_95: [number, number];
  p_value_vs_baseline: number;
  negative_control_agreement: number;
  negative_control_gate_passed: boolean; // agreement <= 0.30
  calibration_slope: number;
  calibration_intercept: number;
  brier_score: number;
  calibration_curve: CalibrationPoint[];
  decision_curve: DecisionCurvePoint[];
  never_nan_enforced: boolean;
  provenance?: Provenance;
}

export interface AuditResults {
  claim_id: string;
  license_result: LicenseCheckResult;
  baseline_result?: BaselineHarnessResult;
  leakage_result?: LeakageCheckResult;
  referee_result?: StatisticalRefereeResult;
  overall_status: 'COMPLETED' | 'TERMINATED_AT_LICENSE' | 'TERMINATED_UNVERIFIABLE';
  tool_call_count: number;
  provenance?: Provenance;
}

export type VerdictType =
  | 'REPRODUCED'
  | 'FAILS_BASELINE'
  | 'LEAKAGE_DETECTED'
  | 'UNVERIFIABLE'
  | 'OUT_OF_SCOPE';

export interface AuthorResponse {
  response_id: string;
  author_name: string;
  timestamp: string;
  text: string;
  sha256_hash: string;
  rebuttal_artifact_url?: string;
}

export interface VerdictRecord {
  verdict_id: string;
  claim_id: string;
  timestamp: string;
  block_height: number;
  previous_block_hash: string;
  sha256_hash: string;
  /** Python referee-core decision hash (when anchored to an engine report). */
  decision_sha256?: string;
  verdict: VerdictType;
  title: string;
  verdict_statement: string;
  domain_task: OncologyDomainTask;
  dataset_id: string;
  scopeTested: string[];
  scopeNotTested: string[];
  universalClaimLimit: string;
  evidenceLinks: {
    claimSpecHash: string;
    auditResultsHash: string;
    ledgerRecordHash: string;
    datasetId: string;
    repositorySnapshot: string;
    rawLogUrl: string;
  };
  tool_invocations: number;
  license_status: 'PASSED' | 'BLOCKED';
  baseline_margin?: number;
  leakage_summary?: string;
  author_responses: AuthorResponse[];
  raw_audit_results: {
    license?: LicenseCheckResult;
    baselines?: BaselineHarnessResult;
    leakage?: LeakageCheckResult;
    referee?: StatisticalRefereeResult;
  };
  provenance?: Provenance;
  synthetic?: boolean;
  /** SHA-256 of the referee-core report this verdict was anchored to. Required for
   *  provenance: 'computed' records so a ledger block can never claim a measurement
   *  that no engine actually produced. */
  report_sha256?: string;
  /** Which component produced the numbers, e.g. 'referee-core' or 'license-gate'. */
  engine_source?: string;
}

export interface RecursiveRepairIteration {
  iteration: number;
  action_taken: string;
  parameter_adjusted: string;
  previous_verdict: VerdictType;
  new_verdict: VerdictType;
  claim_auc: number;
  baseline_auc: number;
  leakage_detected: boolean;
  notes: string;
  mev?: {
    mev: number;
    uTarget: number;
    cCompute: number;
    rRisk: number;
    iteration: number;
    decision: 'PROCEED' | 'HALT';
    reason: string;
    pipelineSkills?: string[];
    pipelineHash?: string;
  };
}

/**
 * State of the autonomous engine.
 *
 * Lives here rather than in `lib/ledger.ts` so that the browser dashboard can
 * reference the type without importing the server-side ledger module (which
 * pulls in `node:sqlite` and cannot be bundled for the client).
 */
export type SystemStatus = 'RUNNING' | 'PAUSED' | 'STOPPED';

export interface OrchestrationLogStep {
  step_number: number;
  layer: 'Layer 1: Entry' | 'Layer 2: Orchestrator' | 'Layer 3: Referee Engine' | 'Layer 4: Ledger' | 'Layer 5: Recursive Loop';
  tool_name: string;
  input_summary: string;
  output_status: 'RUNNING' | 'SUCCESS' | 'BLOCKED' | 'FAILED' | 'UNVERIFIABLE';
  details: string;
  timestamp: string;
}

export type RepairType =
  | 'LEAKAGE_FIX'
  | 'BASELINE_ALIGNMENT'
  | 'FEATURE_RESTRICTION'
  | 'CALIBRATION_CHECK';

export interface RepairProposal {
  repair_type: RepairType;
  description: string;
  modifies: string[];
  expected_effect: string;
  confidence_score?: number;
  source_principle_id?: string;
}

export interface Principle {
  principle_id: string;
  domain: OncologyDomainTask | string;
  trigger: string;
  lesson: string;
  evidence_trajectories: string[];
  utility_score: number;
  created_at: string;
  last_used: string;
  source: 'failure' | 'success';
  status: 'active' | 'candidate' | 'pruned' | 'flagged_for_human_review';
  suggested_repair_type?: RepairType;
  human_review_notes?: string;
}

export interface HarnessEntry {
  harness_id: string;
  domain: OncologyDomainTask;
  task_type: string;
  strategy: string;
  source: string;
  performance: {
    avg_iterations_to_verdict: number;
    accuracy_vs_human_review: number;
  };
  status: 'active' | 'testing' | 'deprecated';
  last_evaluated: string;
  supporting_principles?: string[];
}

export interface ReflectionTrajectory {
  trajectory_id: string;
  claim_id: string;
  claim_spec: ClaimSpec;
  tool_sequence: string[];
  audit_results: AuditResults;
  final_verdict: VerdictType;
  failure_reason: string;
  repair_attempts: RecursiveRepairIteration[];
  reflected_at: string;
  generated_principle_id?: string;
}

// ==========================================
// DIGITAL WETLAB SCHEMA (PRISMA / FASTAPI)
// ==========================================

export type SkillDomain =
  | 'transcriptomics'
  | 'pathology'
  | 'neuro_oncology'
  | 'radiology'
  | 'clinical'
  | 'general';

export interface SkillPrimitive {
  id: string;
  domain: SkillDomain;
  description: string;
  inputSchema: Record<string, unknown>;
  isActive: boolean;
}

export interface ExperienceCase {
  id: string;
  domain: string;
  failureMode: string;
  lesson: string;
  expectedUplift: number; // U_target: How likely is a fix to succeed? (0.0 - 1.0)
  pipelineHash: string; // Used to calculate R_risk
  sourceAudit?: string;
  utility?: number;
  createdAt?: string;
}

export interface SkillCall {
  skill_id: string;
  params: Record<string, unknown>;
  dataset_id: string;
}

export interface SkillExecutionResult {
  skill_id: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  result: Record<string, unknown>;
  timestamp: string;
  execution_ms: number;
}

export interface WetlabExperiment {
  id: string;
  domain: string;
  hypothesis: string;
  dataset_id: string;
  pipelineConfig: SkillCall[];
  executionResults: SkillExecutionResult[];
  pastFailuresConsulted: ExperienceCase[];
  avoidanceStrategy: string;
  finalVerdict: VerdictType;
  verdictRecordId: string;
  verdictHash: string;
  experienceUpdateCreated?: ExperienceCase;
  timestamp: string;
}


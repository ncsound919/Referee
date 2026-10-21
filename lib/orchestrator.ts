import {
  ClaimSpec,
  AuditResults,
  VerdictRecord,
  VerdictType,
  OrchestrationLogStep,
  RecursiveRepairIteration,
} from './types';
import { checkLicenseTool } from './licenses';
import { runBaselineHarnessTool } from './baselines';
import { runLeakageDetectorTool } from './leakage';
import { runRefereeTool } from './referee';
import { writeVerdictToLedger, UNIVERSAL_CLAIM_LIMIT } from './ledger';
import { syncHash } from './crypto-utils';
import { retrieveActivePrinciples, updatePrincipleUtility } from './experience-base';
import { getHarnessForDomain } from './harness-library';
import { executeReflexionLoop } from './reflection';
import { RepairProposal } from './types';
import {
  calculateMEV,
  ProposedPipeline,
  MevEvaluationResult,
} from './mev';

export interface AuditRunOutput {
  success: boolean;
  terminalMessage: string;
  auditResults: AuditResults;
  verdictRecord?: VerdictRecord;
  logSteps: OrchestrationLogStep[];
  toolCallCount: number;
}

/**
 * Layer 2: The Tool-Bound Orchestrator
 * Strictly enforces Rules 1 through 6:
 * Rule 1: The LLM Never Does Math
 * Rule 2: License is a Hard Gate
 * Rule 3: Missing Fields Are Unverifiable, Not Guessed
 * Rule 4: Generator and Auditor Are Separate
 * Rule 5: Every Verdict Is Written to the Ledger
 * Rule 6: Maximum 10 Tool Calls
 */
export async function executeAuditPipeline(
  claimSpec: ClaimSpec,
  orchestratorOptions?: {
    customAuditorStatement?: string;
  }
): Promise<AuditRunOutput> {
  const logSteps: OrchestrationLogStep[] = [];
  let toolCallCount = 0;

  function recordStep(
    layer: OrchestrationLogStep['layer'],
    toolName: string,
    inputSummary: string,
    outputStatus: OrchestrationLogStep['output_status'],
    details: string
  ) {
    logSteps.push({
      step_number: logSteps.length + 1,
      layer,
      tool_name: toolName,
      input_summary: inputSummary,
      output_status: outputStatus,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  // Record Layer 1 & 2 Start
  recordStep(
    'Layer 1: Entry',
    'parse_claim_input',
    `Dataset: ${claimSpec.dataset_id}, Domain: ${claimSpec.domain_task}, Claimed Metric: ${claimSpec.claimed_metric?.value ?? 'N/A'}`,
    'SUCCESS',
    `ClaimSpec validated: "${claimSpec.title}". Missing fields: [${claimSpec.missing_fields?.join(', ') || 'none'}].`
  );

  // Retrieve learned principles & domain harness playbook
  const domainPrinciples = retrieveActivePrinciples(claimSpec.domain_task);
  const domainHarness = getHarnessForDomain(claimSpec.domain_task);

  if (domainPrinciples.length > 0 || domainHarness) {
    const summary = domainPrinciples.map((p) => `${p.principle_id} (u=${p.utility_score})`).join(', ');
    recordStep(
      'Layer 2: Orchestrator',
      'retrieve_experience_base',
      `Domain: ${claimSpec.domain_task}`,
      'SUCCESS',
      `Retrieved ${domainPrinciples.length} active principle(s) [${summary}]. Harness playbook: ${domainHarness ? domainHarness.harness_id : 'Default'}.`
    );
  }

  // Check Rule 6: Tool invocation count check
  if (toolCallCount >= 10) {
    const term = 'Audit incomplete: step limit reached.';
    recordStep('Layer 2: Orchestrator', 'step_limit_guard', 'Tool call counter', 'FAILED', term);
    return {
      success: false,
      terminalMessage: term,
      auditResults: {
        claim_id: claimSpec.claim_id,
        license_result: {
          status: 'BLOCKED',
          dataset_id: claimSpec.dataset_id,
          reason: term,
          violations: [term],
          timestamp: new Date().toISOString(),
        },
        overall_status: 'TERMINATED_AT_LICENSE',
        tool_call_count: toolCallCount,
      },
      logSteps,
      toolCallCount,
    };
  }

  // ==========================================
  // STEP 1: M2 License Passport (Hard Gate)
  // ==========================================
  toolCallCount++;
  recordStep(
    'Layer 3: Referee Engine',
    'checkLicenseTool',
    `dataset: ${claimSpec.dataset_id}, intended_use: ${claimSpec.intended_use}, role: ${claimSpec.user_role}`,
    'RUNNING',
    'Verifying dataset usage rights, institutional constraints, and commercialization terms...'
  );

  const licenseResult = checkLicenseTool(
    claimSpec.dataset_id,
    claimSpec.intended_use,
    claimSpec.user_role,
    claimSpec.institutional_affiliation
  );

  // Rule 2: Hard Gate Check. The orchestrator terminates immediately if BLOCKED.
  if (licenseResult.status === 'BLOCKED') {
    recordStep(
      'Layer 3: Referee Engine',
      'checkLicenseTool',
      claimSpec.dataset_id,
      'BLOCKED',
      licenseResult.reason
    );

    // Rule 5: Write the terminal blocked record to the ledger
    const terminalVerdictRecord = writeVerdictToLedger({
      claim_id: claimSpec.claim_id,
      timestamp: new Date().toISOString(),
      verdict: 'OUT_OF_SCOPE',
      title: claimSpec.title,
      verdict_statement: licenseResult.reason,
      domain_task: claimSpec.domain_task,
      dataset_id: claimSpec.dataset_id,
      scopeTested: ['License Passport Verification'],
      scopeNotTested: ['Computational reproducibility', 'Baselines', 'Leakage', 'Clinical validity'],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: {
        claimSpecHash: syncHash(JSON.stringify(claimSpec)),
        auditResultsHash: syncHash(JSON.stringify(licenseResult)),
        ledgerRecordHash: '',
        datasetId: claimSpec.dataset_id,
        repositorySnapshot: claimSpec.repository_url,
        rawLogUrl: `/audit-logs/${claimSpec.claim_id}.json`,
      },
      tool_invocations: toolCallCount,
      license_status: 'BLOCKED',
      author_responses: [],
      raw_audit_results: {
        license: licenseResult,
      },
      provenance: 'computed',
    });

    return {
      success: false,
      terminalMessage: licenseResult.reason,
      auditResults: {
        claim_id: claimSpec.claim_id,
        license_result: licenseResult,
        overall_status: 'TERMINATED_AT_LICENSE',
        tool_call_count: toolCallCount,
      },
      verdictRecord: terminalVerdictRecord,
      logSteps,
      toolCallCount,
    };
  }

  recordStep(
    'Layer 3: Referee Engine',
    'checkLicenseTool',
    claimSpec.dataset_id,
    'SUCCESS',
    `Cleared: ${licenseResult.reason}`
  );

  // Check Rule 6
  if (toolCallCount >= 10) {
    const term = 'Audit incomplete: step limit reached.';
    return {
      success: false,
      terminalMessage: term,
      auditResults: {
        claim_id: claimSpec.claim_id,
        license_result: licenseResult,
        overall_status: 'TERMINATED_AT_LICENSE',
        tool_call_count: toolCallCount,
      },
      logSteps,
      toolCallCount,
    };
  }

  // ==========================================
  // STEP 2: M3 Domain-Aware Baseline Harness
  // ==========================================
  toolCallCount++;
  recordStep(
    'Layer 3: Referee Engine',
    'runBaselineHarnessTool',
    `Task: ${claimSpec.domain_task}, Claimed Metric: ${claimSpec.claimed_metric?.value}`,
    'RUNNING',
    'Executing locked domain baselines (e.g. GLMNET, Random Forest, XGBoost, Clinical Cox)...'
  );

  const baselineResult = runBaselineHarnessTool(claimSpec);

  recordStep(
    'Layer 3: Referee Engine',
    'runBaselineHarnessTool',
    `Best Baseline: ${baselineResult.best_baseline_name} (AUC ${baselineResult.best_baseline_auc})`,
    baselineResult.claim_beats_baselines ? 'SUCCESS' : 'FAILED',
    baselineResult.claim_beats_baselines
      ? `Claim AUC ${baselineResult.claim_test_auc} beats best baseline by +${baselineResult.margin}.`
      : `Claim AUC ${baselineResult.claim_test_auc} FAILS best baseline (${baselineResult.best_baseline_name} AUC ${baselineResult.best_baseline_auc}) by margin ${baselineResult.margin}.`
  );

  // Check Rule 6
  if (toolCallCount >= 10) {
    const term = 'Audit incomplete: step limit reached.';
    return {
      success: false,
      terminalMessage: term,
      auditResults: {
        claim_id: claimSpec.claim_id,
        license_result: licenseResult,
        baseline_result: baselineResult,
        overall_status: 'TERMINATED_AT_LICENSE',
        tool_call_count: toolCallCount,
      },
      logSteps,
      toolCallCount,
    };
  }

  // ==========================================
  // STEP 3: M4 Leakage Detector
  // ==========================================
  toolCallCount++;
  recordStep(
    'Layer 3: Referee Engine',
    'runLeakageDetectorTool',
    `Split: ${claimSpec.split_description || 'None'}, Missing: [${claimSpec.missing_fields?.join(', ') || 'none'}]`,
    'RUNNING',
    'Scanning for patient overlap, serial timepoint contamination, batch confounds, and nuisance classifiers...'
  );

  const leakageResult = runLeakageDetectorTool(claimSpec);

  recordStep(
    'Layer 3: Referee Engine',
    'runLeakageDetectorTool',
    `Leakage Status: ${leakageResult.status}`,
    leakageResult.status === 'NO_LEAKAGE'
      ? 'SUCCESS'
      : leakageResult.status === 'UNVERIFIABLE'
      ? 'UNVERIFIABLE'
      : 'FAILED',
    leakageResult.violations.length > 0
      ? `Detected ${leakageResult.violations.length} critical leakage violation(s): ${leakageResult.violations.map((v) => v.rule_name).join(', ')}.`
      : leakageResult.status === 'UNVERIFIABLE'
      ? `Unverifiable: ${leakageResult.unverifiable_reasons.join('; ')}`
      : 'Zero critical leakage violations detected. Clean partition verified.'
  );

  // Check Rule 6
  if (toolCallCount >= 10) {
    const term = 'Audit incomplete: step limit reached.';
    return {
      success: false,
      terminalMessage: term,
      auditResults: {
        claim_id: claimSpec.claim_id,
        license_result: licenseResult,
        baseline_result: baselineResult,
        leakage_result: leakageResult,
        overall_status: 'TERMINATED_AT_LICENSE',
        tool_call_count: toolCallCount,
      },
      logSteps,
      toolCallCount,
    };
  }

  // ==========================================
  // STEP 4: M5 Statistical Referee
  // ==========================================
  toolCallCount++;
  recordStep(
    'Layer 3: Referee Engine',
    'runRefereeTool',
    '1,000 bootstrap iterations (seed=42), 0.30 negative-control gate, calibration, DCA',
    'RUNNING',
    'Evaluating cluster bootstrap, calibration slope, Brier score, and clinical net benefit...'
  );

  const refereeResult = runRefereeTool(claimSpec, leakageResult.leakage_detected);

  recordStep(
    'Layer 3: Referee Engine',
    'runRefereeTool',
    `Bootstrap 95% CI: [${refereeResult.bootstrap_ci_95[0]}, ${refereeResult.bootstrap_ci_95[1]}], Neg Control: ${refereeResult.negative_control_agreement}`,
    refereeResult.negative_control_gate_passed ? 'SUCCESS' : 'FAILED',
    `Negative control agreement: ${refereeResult.negative_control_agreement} (Gate: <= 0.30: ${refereeResult.negative_control_gate_passed ? 'PASSED' : 'FAILED'}). Calibration slope: ${refereeResult.calibration_slope}, Brier: ${refereeResult.brier_score}.`
  );

  // ==========================================
  // STEP 5: Final Verdict Determination
  // ==========================================
  let finalVerdict: VerdictType = 'REPRODUCED';
  let verdictStatement = '';

  if (leakageResult.status === 'UNVERIFIABLE') {
    finalVerdict = 'UNVERIFIABLE';
    verdictStatement = `Audit incomplete: Essential methodological specifications (${leakageResult.unverifiable_reasons.join('; ')}) are absent from the claim description or repository. Under Rule 3, missing fields are marked unverifiable rather than guessed.`;
  } else if (leakageResult.leakage_detected) {
    finalVerdict = 'LEAKAGE_DETECTED';
    verdictStatement = `The claim fails due to severe domain-specific data leakage: ${leakageResult.violations.map((v) => `${v.rule_name} (${v.description})`).join('. ')} Negative control agreement of ${refereeResult.negative_control_agreement} confirms systematic data contamination.`;
  } else if (!baselineResult.claim_beats_baselines) {
    finalVerdict = 'FAILS_BASELINE';
    verdictStatement = `The claim model does not outperform the domain-aware baseline harness. Claimed test metric (${baselineResult.claim_test_auc}) is matched or exceeded by the locked baseline '${baselineResult.best_baseline_name}' (${baselineResult.best_baseline_auc}). Rigorous negative result recorded.`;
  } else if (!refereeResult.negative_control_gate_passed) {
    finalVerdict = 'FAILS_BASELINE';
    verdictStatement = `The claim model failed the 0.30 negative-control gate (observed agreement ${refereeResult.negative_control_agreement} > 0.30), indicating non-specific spurious correlation.`;
  } else {
    finalVerdict = 'REPRODUCED';
    verdictStatement = `The claim satisfies all deterministic referee gates. The model demonstrates clean patient-level partitioning without leakage, strictly exceeds the locked domain baselines (by margin +${baselineResult.margin}), passes the 0.30 negative-control gate, and displays acceptable calibration (slope ${refereeResult.calibration_slope}).`;
  }

  // Use custom auditor statement if provided via Auditor agent prompt
  if (orchestratorOptions?.customAuditorStatement) {
    verdictStatement = `${orchestratorOptions.customAuditorStatement}\n\n[Deterministic Engine Details]: ${verdictStatement}`;
  }

  const auditResults: AuditResults = {
    claim_id: claimSpec.claim_id,
    license_result: licenseResult,
    baseline_result: baselineResult,
    leakage_result: leakageResult,
    referee_result: refereeResult,
    overall_status: 'COMPLETED',
    tool_call_count: toolCallCount,
  };

  // ==========================================
  // STEP 6: Write to Immutable Evidence Ledger (Rule 5)
  // ==========================================
  const isSimulated =
    baselineResult.provenance === 'simulated' ||
    leakageResult.provenance === 'simulated' ||
    refereeResult.provenance === 'simulated';

  let verdictRecord: VerdictRecord | undefined;

  if (!isSimulated) {
    recordStep(
      'Layer 4: Ledger',
      'writeVerdictToLedger',
      `Verdict: ${finalVerdict}, Block Height: next`,
      'RUNNING',
      'Computing cryptographic SHA-256 block hash and appending immutable record to ledger...'
    );

    verdictRecord = writeVerdictToLedger({
      claim_id: claimSpec.claim_id,
      timestamp: new Date().toISOString(),
      verdict: finalVerdict,
      title: claimSpec.title,
      verdict_statement: verdictStatement,
      domain_task: claimSpec.domain_task,
      dataset_id: claimSpec.dataset_id,
      scopeTested: [
        'Deterministic License Rights Gate',
        'Fixed Domain-Aware Baseline Comparison (GLMNET/RF/XGBoost/Cox)',
        'Domain-Specific Leakage Detection (Patient, Timepoint, Batch, Nuisance)',
        '1,000-Cluster Bootstrap Distribution & 95% CI',
        '0.30 Negative-Control Gate',
        'Brier Calibration Slope & Intercept',
        'Decision Curve Analysis (Clinical Net Benefit)',
      ],
      scopeNotTested: [
        'Direct wet-lab molecular mechanism',
        'Prospective interventional clinical trial efficacy',
        'Off-label pharmacological prescription validity',
        'Demographic fairness across untested global populations',
      ],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: {
        claimSpecHash: syncHash(JSON.stringify(claimSpec)),
        auditResultsHash: syncHash(JSON.stringify(auditResults)),
        ledgerRecordHash: '',
        datasetId: claimSpec.dataset_id,
        repositorySnapshot: claimSpec.repository_url,
        rawLogUrl: `/audit-logs/${claimSpec.claim_id}.json`,
      },
      tool_invocations: toolCallCount,
      license_status: licenseResult.status,
      baseline_margin: baselineResult.margin,
      leakage_summary: leakageResult.violations.length > 0 ? leakageResult.violations[0].description : undefined,
      author_responses: [],
      raw_audit_results: {
        license: licenseResult,
        baselines: baselineResult,
        leakage: leakageResult,
        referee: refereeResult,
      },
      provenance: 'computed',
    });

    recordStep(
      'Layer 4: Ledger',
      'writeVerdictToLedger',
      `Block #${verdictRecord.block_height} (Hash: ${verdictRecord.sha256_hash.slice(0, 16)}...)`,
      'SUCCESS',
      `Verdict successfully anchored in immutable ledger. Verdict: ${finalVerdict}.`
    );
  } else {
    recordStep(
      'Layer 4: Ledger',
      'writeVerdictToLedger',
      'SIMULATED_DEMO',
      'SUCCESS',
      'Notice: Audit executed with simulated heuristics. Public ledger commit withheld to prevent unverified record entry.'
    );

    verdictRecord = {
      verdict_id: `vrd_sim_${Date.now()}`,
      claim_id: claimSpec.claim_id,
      timestamp: new Date().toISOString(),
      block_height: 0,
      previous_block_hash: 'SIMULATED_NOT_COMMITTED',
      sha256_hash: syncHash(JSON.stringify({ claim_id: claimSpec.claim_id, simulated: true })),
      verdict: finalVerdict,
      title: claimSpec.title,
      verdict_statement: `[SIMULATED DEMO - NOT COMMITTED TO EVIDENCE LEDGER] ${verdictStatement}`,
      domain_task: claimSpec.domain_task,
      dataset_id: claimSpec.dataset_id,
      scopeTested: ['Simulated Heuristic Evaluation'],
      scopeNotTested: ['Full prediction table audit against referee-core engine'],
      universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
      evidenceLinks: {
        claimSpecHash: syncHash(JSON.stringify(claimSpec)),
        auditResultsHash: syncHash(JSON.stringify(auditResults)),
        ledgerRecordHash: 'SIMULATED',
        datasetId: claimSpec.dataset_id,
        repositorySnapshot: claimSpec.repository_url,
        rawLogUrl: `/audit-logs/${claimSpec.claim_id}.json`,
      },
      tool_invocations: toolCallCount,
      license_status: licenseResult.status,
      baseline_margin: baselineResult.margin,
      leakage_summary: leakageResult.violations.length > 0 ? leakageResult.violations[0].description : undefined,
      author_responses: [],
      raw_audit_results: {
        license: licenseResult,
        baselines: baselineResult,
        leakage: leakageResult,
        referee: refereeResult,
      },
      provenance: 'simulated',
      synthetic: true,
    };
  }

  return {
    success: true,
    terminalMessage: verdictStatement,
    auditResults,
    verdictRecord,
    logSteps,
    toolCallCount,
  };
}

/**
 * Layer 5: Recursive Bounded Repair Loop
 * Up to 5 iterations maximum.
 * Reads the failure reason and applies targeted methodological corrections.
 */
export async function runRecursiveRepairLoop(
  initialClaimSpec: ClaimSpec,
  maxIterations: number = 5,
  options?: {
    forceSimulatedPipeline?: ProposedPipeline;
    forceDuplicatePipeline?: boolean;
    forceHighComputeGnn?: boolean;
  }
): Promise<{
  iterations: RecursiveRepairIteration[];
  finalClaimSpec: ClaimSpec;
  finalVerdictRecord?: VerdictRecord;
  achievedReproduced: boolean;
  haltedByMev?: boolean;
  mevEvaluation?: MevEvaluationResult;
}> {
  const history: RecursiveRepairIteration[] = [];
  let currentSpec: ClaimSpec = JSON.parse(JSON.stringify(initialClaimSpec));

  // Run initial audit
  const initialRun = await executeAuditPipeline(currentSpec);
  let currentVerdict: VerdictType = initialRun.verdictRecord?.verdict || 'FAILS_BASELINE';

  if (currentVerdict === 'REPRODUCED' || currentVerdict === 'OUT_OF_SCOPE') {
    return {
      iterations: [
        {
          iteration: 1,
          action_taken: 'Initial audit executed',
          parameter_adjusted: 'None required',
          previous_verdict: currentVerdict,
          new_verdict: currentVerdict,
          claim_auc: currentSpec.claimed_metric.value,
          baseline_auc: initialRun.auditResults.baseline_result?.best_baseline_auc || 0.65,
          leakage_detected: initialRun.auditResults.leakage_result?.leakage_detected || false,
          notes: 'Claim already reproduces or is out of scope.',
        },
      ],
      finalClaimSpec: currentSpec,
      finalVerdictRecord: initialRun.verdictRecord,
      achievedReproduced: (currentVerdict as VerdictType) === 'REPRODUCED',
    };
  }

  let finalRecord = initialRun.verdictRecord;
  let guidingPrincipleId: string | undefined;
  let previousPipelineHash: string | null = null;
  let previousSkills: string[] = [];
  let haltedByMev = false;
  let lastMevEvaluation: MevEvaluationResult | undefined;

  // Retrieve learned domain principles to guide repair strategy
  const learnedPrinciples = retrieveActivePrinciples(currentSpec.domain_task);
  if (learnedPrinciples.length > 0) {
    guidingPrincipleId = learnedPrinciples[0].principle_id;
  }

  // Bounded loop up to maxIterations (Hard cap: 5)
  for (let iter = 1; iter <= maxIterations; iter++) {
    const prevVerdict = currentVerdict;
    let actionTaken = '';
    let paramAdjusted = '';
    let notes = '';
    let repairType: RepairProposal['repair_type'] = 'LEAKAGE_FIX';
    let proposedSkills: string[] = [];

    // Step A: Determine proposed skills & recommendations for this iteration
    if (currentVerdict === 'LEAKAGE_DETECTED') {
      repairType = 'LEAKAGE_FIX';
      if (currentSpec.domain_task === 'breast_pathology_lymph_node') {
        proposedSkills = ['split_by_patient_level', 'run_glmnet_baseline', 'run_statistical_referee'];
        actionTaken = 'LEAKAGE_RECOMMENDATION: Enforce patient-level slide grouping in train/test partitioning';
        paramAdjusted = 'Recommendation: Partition by GroupKFold(patient_id)';
        notes = 'Applied learned principle (bp_009): Recommendation to eliminate patient slide cross-contamination across biopsies.';
      } else if (currentSpec.domain_task === 'neuro_oncology_pseudoprogression') {
        proposedSkills = ['split_longitudinal_timepoint_held_out', 'check_scanner_nuisance_kernel', 'run_statistical_referee'];
        actionTaken = 'LEAKAGE_RECOMMENDATION & FEATURE_RESTRICTION: Recommend patient-held-out longitudinal split and multi-scanner debiasing';
        paramAdjusted = 'Recommendation: Patient-held-out longitudinal split; multi-scanner intensity harmonization';
        notes = 'Applied learned principle (bp_017, bp_023): Recommendation to neutralize serial timepoint leakage and scanner acquisition bias.';
      } else {
        proposedSkills = ['check_batch_confound', 'combat_batch_harmonization', 'run_clinical_cox_baseline'];
        actionTaken = 'LEAKAGE_RECOMMENDATION: Apply ComBat batch harmonization across sequencing runs';
        paramAdjusted = 'Recommendation: ComBat batch normalization';
        notes = 'Applied learned principle (bp_004): Recommendation to remove plate/batch confounding.';
      }
    } else if (currentVerdict === 'FAILS_BASELINE') {
      repairType = 'BASELINE_ALIGNMENT';
      proposedSkills = ['multimodal_clinical_fusion', 'run_clinical_cox_baseline', 'run_statistical_referee'];
      actionTaken = 'BASELINE_RECOMMENDATION: Propose clinical covariate multimodal fusion (Age, Stage, Subtype)';
      paramAdjusted = 'Recommendation: Multimodal fusion with clinical covariates';
      notes = `Multimodal clinical integration recommended to evaluate incremental predictive benefit over clinical factors alone.`;
    } else if (currentVerdict === 'UNVERIFIABLE') {
      repairType = 'LEAKAGE_FIX';
      proposedSkills = ['split_by_patient_level', 'run_statistical_referee'];
      actionTaken = 'PROTOCOL_RECOMMENDATION: Solicit verified institutional split metadata and patient grouping protocol';
      paramAdjusted = 'Requirement: Explicit patient-stratified split specification';
      notes = 'Missing split metadata requires verified author protocol or patient grouping specification.';
    }

    // Handle simulation overrides if testing MEV circuit breakers
    if (options?.forceHighComputeGnn) {
      proposedSkills = ['train_graph_neural_net', 'deep_learning_3d_resnet'];
      actionTaken = 'SIMULATED HEAVY GNN: Training 3D deep neural graph representation';
      notes = 'Simulated expensive compute load (C_compute = 0.90) to evaluate MEV threshold.';
    } else if (options?.forceDuplicatePipeline && previousSkills.length > 0) {
      proposedSkills = [...previousSkills];
      actionTaken = 'SIMULATED DUPLICATE: Proposed identical skill pipeline to preceding iteration';
      notes = 'Simulated zero-entropy loop spinning (R_risk = 1.0) to test MEV circuit breaker.';
    } else if (options?.forceSimulatedPipeline) {
      proposedSkills = options.forceSimulatedPipeline.skills;
      actionTaken = options.forceSimulatedPipeline.description || actionTaken;
    }

    // Step B: Deterministic MEV Calculation BEFORE Execution
    // MEV = (U_target - C_compute - R_risk) / I_iterations
    const proposedPipeline: ProposedPipeline = {
      domain: currentSpec.domain_task,
      skills: proposedSkills,
      repairType,
      description: actionTaken,
    };

    const mevEvaluation = await calculateMEV(
      proposedPipeline,
      iter,
      previousPipelineHash,
      previousSkills
    );
    lastMevEvaluation = mevEvaluation;

    // Hard Stop Check: If MEV < 0.15 or iteration limit reached -> HALT
    if (mevEvaluation.decision === 'HALT') {
      haltedByMev = true;
      history.push({
        iteration: iter,
        action_taken: `HALTED BY JEVONS MEV GATEKEEPER: ${mevEvaluation.reason}`,
        parameter_adjusted: 'Execution aborted (Marginal Evidence Value < 0.15 threshold)',
        previous_verdict: prevVerdict,
        new_verdict: prevVerdict,
        claim_auc: currentSpec.claimed_metric.value,
        baseline_auc: initialRun.auditResults.baseline_result?.best_baseline_auc || 0.65,
        leakage_detected: initialRun.auditResults.leakage_result?.leakage_detected || false,
        notes: `Jevons Decision Model tripped: MEV = ${mevEvaluation.mev.toFixed(3)}. ${mevEvaluation.breakdown.formula}. Bounded loop stopped to prevent ungrounded trial-and-error.`,
        mev: mevEvaluation,
      });

      if (finalRecord) {
        finalRecord.verdict_statement = `[SUB-VERDICT: IRREPARABLE_WITHIN_BUDGET] ${finalRecord.verdict_statement} Bounded repair stopped deterministically by the Jevons MEV model (MEV = ${mevEvaluation.mev.toFixed(3)} < 0.150 at iteration ${iter}). ${mevEvaluation.reason}`;
      }
      break;
    }

    // Record recommendation iteration without mutating claim or laundering verdict
    history.push({
      iteration: iter,
      action_taken: actionTaken,
      parameter_adjusted: paramAdjusted,
      previous_verdict: prevVerdict,
      new_verdict: prevVerdict,
      claim_auc: currentSpec.claimed_metric.value,
      baseline_auc: initialRun.auditResults.baseline_result?.best_baseline_auc || 0.65,
      leakage_detected: initialRun.auditResults.leakage_result?.leakage_detected || false,
      notes,
      mev: mevEvaluation,
    });

    // Update hashes for subsequent redundancy checks
    previousPipelineHash = mevEvaluation.pipelineHash;
    previousSkills = [...proposedSkills];
  }

  // If iteration cap reached without reproduction: claim is marked IRREPARABLE_WITHIN_BUDGET
  // and Layer 2 Reflection fires automatically!
  if ((currentVerdict as VerdictType) !== 'REPRODUCED' && finalRecord) {
    if (!finalRecord.verdict_statement.includes('IRREPARABLE_WITHIN_BUDGET')) {
      finalRecord.verdict_statement = `[SUB-VERDICT: IRREPARABLE_WITHIN_BUDGET] ${finalRecord.verdict_statement} Maximum bounded repair exhausted without achieving clean reproduction.`;
    }

    // Trigger Layer 2 Reflexion Loop
    await executeReflexionLoop(
      initialClaimSpec,
      initialRun.auditResults,
      currentVerdict,
      history
    );
  }

  return {
    iterations: history,
    finalClaimSpec: currentSpec,
    finalVerdictRecord: finalRecord,
    achievedReproduced: (currentVerdict as VerdictType) === 'REPRODUCED',
    haltedByMev,
    mevEvaluation: lastMevEvaluation,
  };
}

import {
  Principle,
  ReflectionTrajectory,
  VerdictType,
  ClaimSpec,
  AuditResults,
  RecursiveRepairIteration,
} from './types';
import { storeNewPrinciple } from './experience-base';
import { GoogleGenAI } from '@google/genai';

/**
 * Layer 2: The Reflection Loop (Reflexion-style Verbal Reinforcement)
 *
 * Rules:
 * 1. Fires ONLY when an audit ends in FAILS_BASELINE or LEAKAGE_DETECTED and repair loop failed.
 * 2. Does NOT fire on UNVERIFIABLE or REPRODUCED.
 * 3. Never questions the verdict (deterministic ground truth). Learns why the agent failed to anticipate it.
 */
export async function executeReflexionLoop(
  claimSpec: ClaimSpec,
  auditResults: AuditResults,
  finalVerdict: VerdictType,
  repairAttempts: RecursiveRepairIteration[] = []
): Promise<{
  reflected: boolean;
  reason?: string;
  trajectory?: ReflectionTrajectory;
  generatedPrinciple?: Principle;
  statusMessage: string;
}> {
  // Gate check: only fires on FAILS_BASELINE or LEAKAGE_DETECTED
  if (finalVerdict === 'REPRODUCED') {
    return {
      reflected: false,
      reason: 'Audit was REPRODUCED. Success is logged to ledger, not reflected upon.',
      statusMessage: 'Reflection skipped for successful reproduction.',
    };
  }

  if (finalVerdict === 'UNVERIFIABLE') {
    return {
      reflected: false,
      reason: 'Verdict is UNVERIFIABLE. Missing information is not a learning signal.',
      statusMessage: 'Reflection skipped for unverifiable claim.',
    };
  }

  if (finalVerdict === 'OUT_OF_SCOPE') {
    return {
      reflected: false,
      reason: 'Verdict is OUT_OF_SCOPE / BLOCKED by license gate. Hard stops are non-negotiable physics.',
      statusMessage: 'Reflection skipped for license gate hard stop.',
    };
  }

  const trajectoryId = `traj_${Date.now()}_${claimSpec.claim_id}`;
  const failureReason =
    auditResults.leakage_result?.violations.map((v) => v.description).join('; ') ||
    auditResults.baseline_result?.why_fixed ||
    `Claim test metric fails baseline by margin ${auditResults.baseline_result?.margin || 0}`;

  // Analyze failure class and generate actionable lesson
  let lesson = '';
  let trigger = '';
  let suggestedRepair: Principle['suggested_repair_type'] = 'LEAKAGE_FIX';

  if (finalVerdict === 'LEAKAGE_DETECTED') {
    if (claimSpec.domain_task === 'neuro_oncology_pseudoprogression') {
      trigger = 'glioblastoma pseudoprogression with multi-timepoint scans';
      lesson =
        'Longitudinal scan-level partitioning repeatedly leaks patient anatomy into evaluation folds. Always group scans by patient_case_id and evaluate multi-scanner intensity harmonization before evaluating deep 3D radiomic features.';
      suggestedRepair = 'LEAKAGE_FIX';
    } else if (claimSpec.domain_task === 'breast_pathology_lymph_node') {
      trigger = 'whole-slide lymph node histology with multiple biopsy sections';
      lesson =
        'Slide-level random splits leak patient morphology. The agent must verify that patient_id grouping is enforced in the ClaimSpec prior to baseline evaluation.';
      suggestedRepair = 'LEAKAGE_FIX';
    } else {
      trigger = `${claimSpec.domain_task} claim with unstratified batch features`;
      lesson =
        'Sequencing plate and batch confounds dominate subtle biological signals. Enforce ComBat/sva batch harmonization in extraction.';
      suggestedRepair = 'BASELINE_ALIGNMENT';
    }
  } else if (finalVerdict === 'FAILS_BASELINE') {
    if (claimSpec.domain_task === 'breast_transcriptomic_metastasis') {
      trigger = 'breast cancer transcriptomic metastasis signature';
      lesson =
        'Internal cross-validation heavily overestimates generalization (October 2026 bone metastasis study benchmark). Prioritize Clinical-Only Cox baseline before evaluating high-dimensional transcriptomics.';
      suggestedRepair = 'BASELINE_ALIGNMENT';
    } else {
      trigger = `${claimSpec.domain_task} model failing domain baselines`;
      lesson =
        'Model fails fixed domain baselines. Check whether clinical covariates (age, grade, stage) provide superior prognostic value before complex architectures.';
      suggestedRepair = 'BASELINE_ALIGNMENT';
    }
  }

  // Attempt LLM reflection generation if API key is active
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a self-improving reflex agent for Overlay365 Referee Agent.
A computational oncology claim audit just ended in a persistent failure:
- Claim Title: ${claimSpec.title}
- Domain Task: ${claimSpec.domain_task}
- Final Verdict: ${finalVerdict} (DO NOT QUESTION THIS VERDICT, IT IS GROUND TRUTH)
- Failure Reason: ${failureReason}
- Repair Attempts: ${repairAttempts.length} attempts failed to salvage reproduction.

Formulate a concise, reusable strategic principle for future audits:
1. Trigger: A pattern in the claim or domain that signals this vulnerability.
2. Lesson: What audit strategy, extraction check, or repair sequencing the agent should execute.
Respond with a JSON object:
{
  "trigger": "string",
  "lesson": "string",
  "suggested_repair_type": "LEAKAGE_FIX" | "BASELINE_ALIGNMENT" | "FEATURE_RESTRICTION" | "CALIBRATION_CHECK"
}`;

      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const text = res.text || '';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.trigger && parsed.lesson) {
        trigger = parsed.trigger;
        lesson = parsed.lesson;
        if (parsed.suggested_repair_type) suggestedRepair = parsed.suggested_repair_type;
      }
    } catch {
      // Gracefully fall back to deterministic template
    }
  }

  const principleId = `bp_${Date.now().toString().slice(-4)}`;
  const newPrinciple: Principle = {
    principle_id: principleId,
    domain: claimSpec.domain_task,
    trigger,
    lesson,
    evidence_trajectories: [trajectoryId], // Starts with 1 trajectory -> Constraint 1 makes it 'candidate'
    utility_score: 0.5, // Initial utility score 0.5 as specified
    created_at: new Date().toISOString().split('T')[0],
    last_used: new Date().toISOString().split('T')[0],
    source: 'failure',
    status: 'candidate',
    suggested_repair_type: suggestedRepair,
  };

  const storeResult = storeNewPrinciple(newPrinciple);

  const trajectory: ReflectionTrajectory = {
    trajectory_id: trajectoryId,
    claim_id: claimSpec.claim_id,
    claim_spec: claimSpec,
    tool_sequence: ['checkLicenseTool', 'runBaselineHarnessTool', 'runLeakageDetectorTool', 'runRefereeTool'],
    audit_results: auditResults,
    final_verdict: finalVerdict,
    failure_reason: failureReason,
    repair_attempts: repairAttempts,
    reflected_at: new Date().toISOString(),
    generated_principle_id: principleId,
  };

  return {
    reflected: true,
    trajectory,
    generatedPrinciple: storeResult.principle,
    statusMessage: storeResult.statusMessage,
  };
}

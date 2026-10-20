import { createHash } from 'crypto';
import { prisma } from './prisma';

export interface ProposedPipeline {
  domain: string;
  skills: string[]; // e.g., ['split_by_patient_level', 'run_glmnet_baseline']
  repairType?: string;
  description?: string;
}

export interface MevBreakdown {
  formula: string;
  numerator: number;
  denominator: number;
  uTargetDescription: string;
  cComputeDescription: string;
  rRiskDescription: string;
}

export interface MevEvaluationResult {
  mev: number;
  decision: 'PROCEED' | 'HALT';
  reason: string;
  uTarget: number;
  cCompute: number;
  rRisk: number;
  iteration: number;
  pipelineHash: string;
  previousPipelineHash: string | null;
  breakdown: MevBreakdown;
}

/**
 * Normalized compute cost by skill primitive (0.0 to 1.0)
 * Simple statistical baselines are ~0.10 - 0.20
 * Expensive GNN / 3D Deep Learning architectures are 0.85 - 0.90
 */
export const SKILL_COMPUTE_COSTS: Record<string, number> = {
  check_license_passport: 0.02,
  split_by_patient_level: 0.10,
  split_by_slide_level: 0.08,
  split_longitudinal_timepoint_held_out: 0.12,
  check_batch_confound: 0.15,
  check_scanner_nuisance_kernel: 0.20,
  combat_batch_harmonization: 0.18,
  run_glmnet_baseline: 0.15,
  run_clinical_cox_baseline: 0.10,
  run_random_forest_baseline: 0.25,
  run_xgboost_baseline: 0.30,
  run_statistical_referee: 0.20,
  multimodal_clinical_fusion: 0.35,
  train_graph_neural_net: 0.90,
  deep_learning_3d_resnet: 0.85,
  default: 0.20,
};

/**
 * Deterministic hash of proposed pipeline skills and domain
 */
export function hashPipeline(proposed: ProposedPipeline): string {
  const sortedSkills = [...proposed.skills].sort();
  const payload = JSON.stringify({
    domain: proposed.domain,
    skills: sortedSkills,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Compute normalized compute cost C_compute in range [0.0, 1.0]
 */
export function calculateComputeCost(skills: string[]): number {
  if (!skills || skills.length === 0) return 0.10;

  let totalCost = 0;
  for (const skill of skills) {
    const cost = SKILL_COMPUTE_COSTS[skill] ?? SKILL_COMPUTE_COSTS.default;
    totalCost += cost;
  }

  // Bound to [0.02, 1.0]
  return Math.min(1.0, Math.max(0.02, Number(totalCost.toFixed(3))));
}

/**
 * Compute Jaccard or hash-based similarity to quantify R_risk in range [0.0, 1.0]
 * If previous hash matches current hash exactly, R_risk = 1.0 (Exact duplicate proposal).
 * If skills overlap with previous attempt, R_risk is the Jaccard similarity.
 */
export function calculateRedundancyRisk(
  proposedSkills: string[],
  currentHash: string,
  previousPipelineHash: string | null,
  previousSkills?: string[]
): number {
  if (!previousPipelineHash) {
    return 0.0; // Iteration 1: zero previous redundancy
  }

  if (currentHash === previousPipelineHash) {
    return 1.0; // Exact duplicate pipeline
  }

  if (previousSkills && previousSkills.length > 0) {
    const currentSet = new Set(proposedSkills);
    const prevSet = new Set(previousSkills);

    let intersectionCount = 0;
    for (const skill of currentSet) {
      if (prevSet.has(skill)) {
        intersectionCount++;
      }
    }

    const unionCount = new Set([...proposedSkills, ...previousSkills]).size;
    if (unionCount === 0) return 0.0;

    const jaccard = intersectionCount / unionCount;
    return Number(jaccard.toFixed(3));
  }

  return 0.15; // Small default residual redundancy risk if hash differs but previous skill set unparsed
}

/**
 * Jevons-like Decision Model: Marginal Evidence Value (MEV) Gatekeeper
 * Evaluates the agent's proposed next step before execution.
 *
 * Formula:
 * MEV = (U_target - C_compute - R_risk) / I_iterations
 *
 * Hard Stop Rules:
 * 1. If MEV < 0.15: halt with IRREPARABLE_WITHIN_BUDGET.
 * 2. If I_iterations >= 5: halt regardless of MEV.
 */
export async function calculateMEV(
  proposed: ProposedPipeline,
  iterationCount: number,
  previousPipelineHash: string | null,
  previousSkills?: string[]
): Promise<MevEvaluationResult> {
  const pipelineHash = hashPipeline(proposed);

  // 1. Calculate U_target (Target Utility)
  // Look up the domain in the ExperienceBase via Prisma.
  // If past failures in this domain were often fixed by these skills, U_target is high.
  const pastExperience = await prisma.experienceCase.findMany({
    where: { domain: proposed.domain },
    orderBy: { utility: 'desc' },
  });

  let uTarget = 0.50; // Default baseline utility
  let uTargetDescription = 'Default domain prior (no prior empirical cases matching exactly).';

  if (pastExperience.length > 0) {
    // Check if any past lessons explicitly mention proposed skills
    const matchingCases = pastExperience.filter((exp) => {
      const lessonLower = exp.lesson.toLowerCase();
      return proposed.skills.some((skill) =>
        lessonLower.includes(skill.replace(/_/g, ' ')) ||
        lessonLower.includes(skill)
      );
    });

    if (matchingCases.length > 0) {
      // High target utility grounded in empirical past success
      const highestUplift = Math.max(...matchingCases.map((c) => c.expectedUplift));
      uTarget = Number(highestUplift.toFixed(3));
      uTargetDescription = `Empirically grounded from ${matchingCases.length} ExperienceBase case(s) (${matchingCases[0].id}: expected uplift ${(uTarget * 100).toFixed(0)}%).`;
    } else {
      // Use domain average
      const avgUplift =
        pastExperience.reduce((sum, c) => sum + c.expectedUplift, 0) / pastExperience.length;
      uTarget = Number(avgUplift.toFixed(3));
      uTargetDescription = `Grounded in ${pastExperience.length} domain ExperienceBase case(s) (average uplift ${(uTarget * 100).toFixed(0)}%).`;
    }
  }

  // 2. Calculate C_compute (Compute Cost)
  const cCompute = calculateComputeCost(proposed.skills);
  const cComputeDescription = `Cost normalized across ${proposed.skills.length} primitive(s) [${proposed.skills.join(', ')}].`;

  // 3. Calculate R_risk (Risk of Redundancy)
  const rRisk = calculateRedundancyRisk(
    proposed.skills,
    pipelineHash,
    previousPipelineHash,
    previousSkills
  );
  const rRiskDescription =
    rRisk === 1.0
      ? 'Duplicate pipeline hash (100% redundancy with preceding failed execution).'
      : rRisk > 0
      ? `Jaccard overlap ${(rRisk * 100).toFixed(0)}% with preceding iteration.`
      : 'Novel pipeline configuration (0% overlap with previous attempt).';

  // 4. Calculate I_iterations (Iteration Penalty)
  // We divide by this to enforce diminishing returns.
  const denominator = Math.max(1, iterationCount);
  const numerator = Number((uTarget - cCompute - rRisk).toFixed(3));
  const rawMev = numerator / denominator;
  const mev = Number(rawMev.toFixed(3));

  const formula = `(${uTarget.toFixed(2)} [U_target] - ${cCompute.toFixed(2)} [C_compute] - ${rRisk.toFixed(2)} [R_risk]) / ${denominator} [I_iterations] = ${mev.toFixed(3)}`;

  // Evaluate Hard Stop Rules
  // Rule B: Maximum iteration budget (5)
  if (iterationCount >= 5) {
    return {
      mev,
      decision: 'HALT',
      reason: `Hard stop rule reached: Iteration limit (${iterationCount} >= 5) exhausted. Halting to enforce finite search budget.`,
      uTarget,
      cCompute,
      rRisk,
      iteration: iterationCount,
      pipelineHash,
      previousPipelineHash,
      breakdown: {
        formula,
        numerator,
        denominator,
        uTargetDescription,
        cComputeDescription,
        rRiskDescription,
      },
    };
  }

  // Rule A: If MEV < 0.15, halt with IRREPARABLE_WITHIN_BUDGET
  if (mev < 0.15) {
    let failureMechanism = 'Insufficient marginal evidentiary gain';
    if (rRisk >= 0.7) {
      failureMechanism = `Excessive redundancy risk (${(rRisk * 100).toFixed(0)}% overlap with previous failed pipeline)`;
    } else if (cCompute >= 0.7) {
      failureMechanism = `Excessive compute cost (${cCompute.toFixed(2)}) outweighs target utility (${uTarget.toFixed(2)})`;
    } else if (denominator >= 3) {
      failureMechanism = `Diminishing returns penalty at iteration ${iterationCount} diluted marginal utility below threshold`;
    }

    return {
      mev,
      decision: 'HALT',
      reason: `MEV (${mev.toFixed(3)}) fell below deterministic gatekeeper threshold (0.150). Reason: ${failureMechanism}. Circuit breaker triggered: halting bounded repair loop to prevent ungrounded trial-and-error.`,
      uTarget,
      cCompute,
      rRisk,
      iteration: iterationCount,
      pipelineHash,
      previousPipelineHash,
      breakdown: {
        formula,
        numerator,
        denominator,
        uTargetDescription,
        cComputeDescription,
        rRiskDescription,
      },
    };
  }

  return {
    mev,
    decision: 'PROCEED',
    reason: `MEV (${mev.toFixed(3)}) meets deterministic gatekeeper threshold (>= 0.150). Marginal evidence gain justifies executing iteration ${iterationCount}.`,
    uTarget,
    cCompute,
    rRisk,
    iteration: iterationCount,
    pipelineHash,
    previousPipelineHash,
    breakdown: {
      formula,
      numerator,
      denominator,
      uTargetDescription,
      cComputeDescription,
      rRiskDescription,
    },
  };
}

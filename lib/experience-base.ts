import { Principle, OncologyDomainTask, RepairType } from './types';

export const INITIAL_PRINCIPLES: Principle[] = [
  {
    principle_id: 'bp_017',
    domain: 'neuro_oncology_pseudoprogression',
    trigger: 'claim mentions glioma grade or pseudoprogression prediction with MRI features',
    lesson:
      'Check for timepoint overlap BEFORE running baselines. Pre/post-treatment serial scans from the same patient are the most prevalent leakage source in this domain.',
    evidence_trajectories: ['audit_4421', 'audit_4502', 'claim_glio_mri_deepnet'],
    utility_score: 0.87,
    created_at: '2026-10-15',
    last_used: '2026-10-20',
    source: 'failure',
    status: 'active',
    suggested_repair_type: 'LEAKAGE_FIX',
  },
  {
    principle_id: 'bp_004',
    domain: 'breast_transcriptomic_metastasis',
    trigger: 'breast cancer transcriptomic metastasis or chemoresistance signature',
    lesson:
      'Always check whether the train/test split is patient-level or sample-level and verify sequencing plate/batch harmonization. The October 2026 negative result showed that cross-validation to external holdout collapse is the dominant failure mode in this domain.',
    evidence_trajectories: ['claim_oct2026_bonemets', 'audit_3891'],
    utility_score: 0.92,
    created_at: '2026-10-14',
    last_used: '2026-10-19',
    source: 'failure',
    status: 'active',
    suggested_repair_type: 'BASELINE_ALIGNMENT',
  },
  {
    principle_id: 'bp_009',
    domain: 'breast_pathology_lymph_node',
    trigger: 'whole-slide lymph node or CAMELYON challenge patch classifier',
    lesson:
      'Verify slide-to-patient grouping. When multiple lymph node biopsies are resected from the same patient, slide-level random splits contaminate evaluation folds with patient-specific tissue morphology.',
    evidence_trajectories: ['claim_camelyon17_patchnet', 'audit_2104'],
    utility_score: 0.84,
    created_at: '2026-10-16',
    last_used: '2026-10-18',
    source: 'failure',
    status: 'active',
    suggested_repair_type: 'LEAKAGE_FIX',
  },
  {
    principle_id: 'bp_023',
    domain: 'glioma_grade_survival',
    trigger: 'radiomic or deep learning brain MRI classifier without multi-scanner split',
    lesson:
      'Evaluate nuisance classifier on scanner manufacturer and reconstruction kernel. If nuisance AUC > 0.70, model is learning acquisition site physics rather than tumor biology; apply feature restriction or scanner-held-out testing.',
    evidence_trajectories: ['claim_glio_mri_deepnet', 'audit_1192'],
    utility_score: 0.78,
    created_at: '2026-10-17',
    last_used: '2026-10-20',
    source: 'failure',
    status: 'active',
    suggested_repair_type: 'FEATURE_RESTRICTION',
  },
  {
    principle_id: 'bp_cand_031',
    domain: 'breast_transcriptomic_metastasis',
    trigger: 'extreme class imbalance in lymphovascular invasion prediction',
    lesson:
      'Candidate hypothesis: Check calibration slope when positive prevalence < 10%. Overconfident models yield near-zero calibration slope despite high nominal AUC.',
    evidence_trajectories: ['audit_single_cohort_9901'], // Single trajectory only!
    utility_score: 0.5,
    created_at: '2026-10-19',
    last_used: '2026-10-19',
    source: 'failure',
    status: 'candidate', // Constraint 1: requires 2 supporting trajectories before retrievable
    suggested_repair_type: 'CALIBRATION_CHECK',
  },
];

let experienceStore: Principle[] = [...INITIAL_PRINCIPLES];

export function getExperienceStore(): Principle[] {
  return [...experienceStore];
}

/**
 * Constraint 1: Principles require two supporting trajectories before they are retrievable.
 * Candidate principles (evidence_trajectories.length < 2) are not returned.
 */
export function retrieveActivePrinciples(
  domain?: OncologyDomainTask | string,
  contextQuery?: string
): Principle[] {
  return experienceStore
    .filter((p) => p.status === 'active' && p.utility_score >= 0.3)
    .filter((p) => {
      if (!domain || domain === 'other') return true;
      if (p.domain === domain) return true;
      if (contextQuery && p.trigger.toLowerCase().includes(contextQuery.toLowerCase())) return true;
      return false;
    })
    .sort((a, b) => b.utility_score - a.utility_score);
}

/**
 * Updates a principle's utility score after use.
 * Utility score is updated after each use: did retrieving this principle lead to a faster or more accurate audit?
 */
export function updatePrincipleUtility(
  principleId: string,
  delta: number
): Principle | null {
  const p = experienceStore.find((x) => x.principle_id === principleId);
  if (!p) return null;

  p.utility_score = Number(Math.max(0.0, Math.min(1.0, p.utility_score + delta)).toFixed(3));
  p.last_used = new Date().toISOString().split('T')[0];

  // Constraint 3: Pruning threshold below 0.30
  if (p.utility_score < 0.3 && p.status === 'active') {
    p.status = 'pruned';
  }

  return p;
}

/**
 * Constraint 1: Two supporting trajectories required to promote a candidate to active.
 */
export function addTrajectorySupportToPrinciple(
  principleId: string,
  trajectoryId: string
): { principle: Principle | null; newlyPromoted: boolean } {
  const p = experienceStore.find((x) => x.principle_id === principleId);
  if (!p) return { principle: null, newlyPromoted: false };

  let newlyPromoted = false;
  if (!p.evidence_trajectories.includes(trajectoryId)) {
    p.evidence_trajectories.push(trajectoryId);
  }

  // Check Constraint 1: if candidate now has >= 2 trajectories, promote to active!
  if (p.status === 'candidate' && p.evidence_trajectories.length >= 2) {
    p.status = 'active';
    newlyPromoted = true;
  }

  return { principle: p, newlyPromoted };
}

/**
 * Constraint 3: The utility score decays.
 * Decays utility scores by 10% per simulated period of non-use. Principles below 0.3 are pruned.
 */
export function applyUtilityDecay(decayRate: number = 0.1): {
  decayedCount: number;
  prunedCount: number;
} {
  let decayedCount = 0;
  let prunedCount = 0;

  for (const p of experienceStore) {
    if (p.status === 'active') {
      const prevScore = p.utility_score;
      p.utility_score = Number((p.utility_score * (1 - decayRate)).toFixed(3));
      decayedCount++;

      if (p.utility_score < 0.3) {
        p.status = 'pruned';
        prunedCount++;
      }
    }
  }

  return { decayedCount, prunedCount };
}

/**
 * Constraint 4: Human review of high-impact principles.
 * A principle that would change the order of the license gate relative to other checks
 * is flagged for human review. The agent cannot learn to bypass the hard stop.
 */
export function storeNewPrinciple(principle: Principle): {
  principle: Principle;
  flaggedForHumanReview: boolean;
  statusMessage: string;
} {
  const lessonLower = (principle.lesson + ' ' + principle.trigger).toLowerCase();

  // Safety check: attempt to alter license gate or bypass hard stop
  const violatesLicenseConstraint =
    lessonLower.includes('skip license') ||
    lessonLower.includes('bypass license') ||
    lessonLower.includes('after baselines check license') ||
    lessonLower.includes('ignore non-commercial');

  if (violatesLicenseConstraint) {
    principle.status = 'flagged_for_human_review';
    principle.human_review_notes =
      'FLAGGED UNDER CONSTRAINT 4: Principle proposes altering license gate precedence or bypassing non-commercial restrictions. Autonomous adoption blocked.';
    experienceStore.push(principle);
    return {
      principle,
      flaggedForHumanReview: true,
      statusMessage:
        'Principle flagged for mandatory human review: attempts to modify immutable license gate physics.',
    };
  }

  // Constraint 1: Starts as 'candidate' unless >= 2 supporting trajectories provided
  if (principle.evidence_trajectories.length < 2) {
    principle.status = 'candidate';
  } else {
    principle.status = 'active';
  }

  experienceStore.push(principle);
  return {
    principle,
    flaggedForHumanReview: false,
    statusMessage:
      principle.status === 'candidate'
        ? 'Stored as candidate principle (Constraint 1: pending 2nd independent trajectory confirmation).'
        : 'Stored and activated in Experience Base.',
  };
}

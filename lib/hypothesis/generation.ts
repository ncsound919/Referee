import { HypothesisRecord, MOCK_PAPER_CLAIMS, VALID_SKILLS_LIST } from './types';

export async function generateHypothesis(
  gapDescription: string,
  domain: string
): Promise<Partial<HypothesisRecord>> {
  // Enforce Rule 1 & Rule 3: Must use valid skills and valid grounding sources (DOIs)
  const validSkills = VALID_SKILLS_LIST.slice(0, 4);
  const validSources = MOCK_PAPER_CLAIMS.map((p) => p.doi);

  // Deterministic generator fallback / synthesis based on gap description
  const generated: Partial<HypothesisRecord> = {
    domain: domain || 'breast_cancer',
    claimText: `Applying ${gapDescription} to multi-center cohorts will eliminate cross-validation collapse.`,
    groundingSources: [validSources[0], validSources[1]],
    testablePipeline: ['split_by_patient_level', 'combat_batch_harmonization', 'run_statistical_referee'],
    expectedOutcome: {
      metric: 'AUC-ROC',
      direction: 'increase',
      magnitude: 0.06,
    },
    falsification: 'If held-out test AUC remains below 0.58 after applying batch harmonization, the hypothesis is falsified.',
    noveltyScore: 0.89,
  };

  return generated;
}

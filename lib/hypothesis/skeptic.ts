import { HypothesisRecord, MOCK_PAPER_CLAIMS, VALID_SKILLS_LIST } from './types';

export interface SkepticCritiqueResult {
  isFlawed: boolean;
  critique: string;
  flawType: 'GROUNDING_FALSE' | 'PIPELINE_INVALID' | 'FALSIFICATION_WEAK' | 'NONE';
}

export async function runSkeptic(hypothesis: Partial<HypothesisRecord>): Promise<SkepticCritiqueResult> {
  // Adversarial check
  const validDois = MOCK_PAPER_CLAIMS.map((p) => p.doi);
  const invalidSource = hypothesis.groundingSources?.some((src) => !validDois.includes(src));

  if (invalidSource) {
    return {
      isFlawed: true,
      critique: 'Grounding source DOI could not be verified in the paper corpus.',
      flawType: 'GROUNDING_FALSE',
    };
  }

  const invalidSkill = hypothesis.testablePipeline?.some((skill) => !VALID_SKILLS_LIST.includes(skill));
  if (invalidSkill) {
    return {
      isFlawed: true,
      critique: 'Testable pipeline contains unverified or non-existent skill IDs.',
      flawType: 'PIPELINE_INVALID',
    };
  }

  if (!hypothesis.falsification || hypothesis.falsification.length < 10) {
    return {
      isFlawed: true,
      critique: 'Falsification criterion is missing or insufficiently rigorous.',
      flawType: 'FALSIFICATION_WEAK',
    };
  }

  return {
    isFlawed: false,
    critique: 'Hypothesis passed adversarial review. Grounding citations verified, skill pipeline valid, falsification testable.',
    flawType: 'NONE',
  };
}

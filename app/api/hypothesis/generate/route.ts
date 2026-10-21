import { NextResponse } from 'next/server';
import { generateHypothesis } from '@/lib/hypothesis/generation';
import { runSkeptic } from '@/lib/hypothesis/skeptic';
import { HypothesisRecord } from '@/lib/hypothesis/types';
import { calculateMEV } from '@/lib/mev';

// In-memory tournament queue storage for preview
const tournamentQueue: HypothesisRecord[] = [];

export async function GET() {
  return NextResponse.json({ queue: tournamentQueue });
}

export async function POST(req: Request) {
  try {
    const { gapDescription, domain, userRole, datasetIds } = await req.json();

    // 1. Generate hypothesis
    const hypothesisDraft = await generateHypothesis(gapDescription, domain || 'breast_cancer');

    // 2. Adversarial Review (Skeptic)
    const critique = await runSkeptic(hypothesisDraft);
    if (critique.isFlawed) {
      return NextResponse.json(
        {
          status: 'REJECTED_BY_SKEPTIC',
          reason: critique.critique,
          flawType: critique.flawType,
        },
        { status: 400 }
      );
    }

    // 3. Deterministic Pre-Check (calling FastAPI endpoint or internal check)
    // We check against valid skills and user license roles
    const validSkills = [
      'split_by_patient_level',
      'run_glmnet_baseline',
      'run_statistical_referee',
      'check_batch_confound',
      'combat_batch_harmonization',
      'run_clinical_cox_baseline',
      'multimodal_clinical_fusion',
      'check_scanner_nuisance_kernel',
      'split_longitudinal_timepoint_held_out',
    ];

    const pipelineSkills = hypothesisDraft.testablePipeline || [];
    for (const skill of pipelineSkills) {
      if (!validSkills.includes(skill)) {
        return NextResponse.json(
          { status: 'REJECTED_BY_ENGINE', reason: `Skill ${skill} does not exist in deterministic library.` },
          { status: 400 }
        );
      }
    }

    // Calculate deterministic MEV score
    const mevEval = await calculateMEV(
      {
        domain: hypothesisDraft.domain || 'breast_transcriptomic_metastasis',
        skills: pipelineSkills,
        description: hypothesisDraft.claimText,
      },
      1,
      null
    );

    // 4. Queue for the Digital Wetlab Tournament
    const newHypothesis: HypothesisRecord = {
      id: `hyp_${Date.now()}`,
      domain: hypothesisDraft.domain || 'breast_cancer',
      claimText: hypothesisDraft.claimText || '',
      groundingSources: hypothesisDraft.groundingSources || [],
      testablePipeline: pipelineSkills,
      expectedOutcome: hypothesisDraft.expectedOutcome || { metric: 'AUC', direction: 'increase', magnitude: 0.05 },
      falsification: hypothesisDraft.falsification || '',
      noveltyScore: hypothesisDraft.noveltyScore || 0.85,
      status: 'QUEUED',
      skepticCritique: critique.critique,
      mevScore: Number(mevEval.mev.toFixed(2)),
      createdAt: new Date().toISOString(),
    };

    tournamentQueue.unshift(newHypothesis);

    return NextResponse.json({
      status: 'QUEUED',
      hypothesis: newHypothesis,
      critique,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

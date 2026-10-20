import { NextRequest, NextResponse } from 'next/server';
import {
  getExperienceStore,
  retrieveActivePrinciples,
  updatePrincipleUtility,
  addTrajectorySupportToPrinciple,
  applyUtilityDecay,
  storeNewPrinciple,
} from '@/lib/experience-base';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const domain = url.searchParams.get('domain');

  if (domain) {
    const active = retrieveActivePrinciples(domain);
    return NextResponse.json({ principles: active });
  }

  const all = getExperienceStore();
  const activeCount = all.filter((p) => p.status === 'active').length;
  const candidateCount = all.filter((p) => p.status === 'candidate').length;
  const prunedCount = all.filter((p) => p.status === 'pruned').length;
  const flaggedCount = all.filter((p) => p.status === 'flagged_for_human_review').length;

  return NextResponse.json({
    total: all.length,
    active_count: activeCount,
    candidate_count: candidateCount,
    pruned_count: prunedCount,
    flagged_count: flaggedCount,
    principles: all,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'decay') {
      const decayRate = body.decay_rate || 0.1;
      const res = applyUtilityDecay(decayRate);
      return NextResponse.json({
        success: true,
        message: `Applied ${decayRate * 100}% utility decay. ${res.decayedCount} principles decayed, ${res.prunedCount} pruned below 0.3 threshold.`,
        ...res,
      });
    }

    if (action === 'support_trajectory') {
      const { principle_id, trajectory_id } = body;
      if (!principle_id || !trajectory_id) {
        return NextResponse.json(
          { error: 'principle_id and trajectory_id are required' },
          { status: 400 }
        );
      }
      const res = addTrajectorySupportToPrinciple(principle_id, trajectory_id);
      return NextResponse.json({
        success: true,
        principle: res.principle,
        newlyPromoted: res.newlyPromoted,
        message: res.newlyPromoted
          ? `Constraint 1 Satisfied: 2 independent trajectories confirmed! Principle '${principle_id}' promoted to ACTIVE.`
          : `Trajectory added. Principle has ${res.principle?.evidence_trajectories.length} supporting trajectories.`,
      });
    }

    if (action === 'update_utility') {
      const { principle_id, delta } = body;
      const p = updatePrincipleUtility(principle_id, delta || 0.05);
      return NextResponse.json({ success: true, principle: p });
    }

    if (action === 'create') {
      const res = storeNewPrinciple(body.principle);
      return NextResponse.json({
        success: true,
        ...res,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

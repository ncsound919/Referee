import { NextRequest, NextResponse } from 'next/server';
import { requireOperator } from '@/lib/internal-auth';
import { runRecursiveRepairLoop } from '@/lib/orchestrator';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import { ClaimSpec } from '@/lib/types';

/**
 * POST /api/recursive-repair
 *
 * Runs the bounded recursive-repair loop on the server. The loop used to be
 * invoked directly from the browser bundle, which meant the ledger and the
 * simulated tools were shipped to the client.
 */
export async function POST(req: NextRequest) {
  const guard = await requireOperator(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    let claimSpec: ClaimSpec;

    if (body.sample_id && SAMPLE_CLAIMS[body.sample_id]) {
      claimSpec = JSON.parse(JSON.stringify(SAMPLE_CLAIMS[body.sample_id]));
    } else if (body.claim_spec) {
      claimSpec = body.claim_spec as ClaimSpec;
    } else {
      return NextResponse.json(
        { error: 'Provide sample_id or claim_spec to run recursive repair loop' },
        { status: 400 }
      );
    }

    const maxIterations = Math.min(5, Math.max(1, body.max_iterations || 5));
    const options = {
      forceDuplicatePipeline: body.force_duplicate_pipeline === true,
      forceHighComputeGnn: body.force_high_compute_gnn === true,
    };

    const result = await runRecursiveRepairLoop(claimSpec, maxIterations, options);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

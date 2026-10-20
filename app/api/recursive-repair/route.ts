import { NextRequest, NextResponse } from 'next/server';
import { runRecursiveRepairLoop } from '@/lib/orchestrator';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import { ClaimSpec } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let claimSpec: ClaimSpec;

    if (body.sample_id && SAMPLE_CLAIMS[body.sample_id]) {
      claimSpec = JSON.parse(JSON.stringify(SAMPLE_CLAIMS[body.sample_id]));
    } else if (body.claim_spec) {
      claimSpec = body.claim_spec;
    } else {
      return NextResponse.json(
        { error: 'Provide sample_id or claim_spec to run recursive repair loop' },
        { status: 400 }
      );
    }

    const maxIterations = Math.min(5, Math.max(1, body.max_iterations || 5));
    const result = await runRecursiveRepairLoop(claimSpec, maxIterations);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

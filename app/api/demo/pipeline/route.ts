import { NextRequest, NextResponse } from 'next/server';
import { requireOperator } from '@/lib/internal-auth';
import { executeAuditPipeline } from '@/lib/orchestrator';
import { ClaimSpec } from '@/lib/types';

/**
 * POST /api/demo/pipeline — run the demo audit pipeline on the server.
 *
 * This pipeline uses the *simulated* heuristic tools (fixed constants, not
 * measurements). It exists so the dashboard can show the orchestration shape
 * without a prediction table, and every number it returns is labelled
 * `simulated` by the orchestrator and blocked from the evidence ledger.
 *
 * It used to run inside the browser bundle. That was wrong twice over: it put
 * the ledger and its `node:sqlite` store in the client bundle (which broke the
 * production build), and it let a browser fabricate a verdict locally. Both
 * are fixed by keeping the pipeline on the server.
 */
export async function POST(req: NextRequest) {
  const guard = await requireOperator(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const claimSpec = body?.claim_spec as ClaimSpec | undefined;

    if (!claimSpec || typeof claimSpec !== 'object') {
      return NextResponse.json(
        { error: 'claim_spec is required.' },
        { status: 400 }
      );
    }

    const output = await executeAuditPipeline(claimSpec);
    return NextResponse.json({ ...output, source: 'simulated-demo' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import {
  runAutonomousIteration,
  getAutonomousState,
  startAutonomousRunner,
  stopAutonomousRunner,
} from '@/lib/autonomous-orchestrator';
import { setSystemStatus } from '@/lib/ledger';

/**
 * GET /api/autonomous/run
 * Telemetry endpoint: returns current autonomous runner status,
 * iteration counts, active principles, and recent execution history.
 */
export async function GET() {
  try {
    const state = getAutonomousState();
    return NextResponse.json(state);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to retrieve autonomous state', details: msg }, { status: 500 });
  }
}

/**
 * POST /api/autonomous/run
 * Controls autonomous loop execution:
 * - action: 'step' (default) -> runs 1 closed-loop research iteration
 * - action: 'start' -> starts background daemon at specified intervalMs
 * - action: 'stop' -> halts background daemon
 * - action: 'status' -> returns state
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'step';

    if (action === 'start') {
      const intervalMs = typeof body.intervalMs === 'number' ? body.intervalMs : 30000;
      const res = startAutonomousRunner(intervalMs);
      return NextResponse.json({ status: 'started', ...res });
    }

    if (action === 'stop') {
      const res = stopAutonomousRunner();
      return NextResponse.json({ status: 'stopped', ...res });
    }

    if (action === 'status') {
      const state = getAutonomousState();
      return NextResponse.json(state);
    }

    // Default: Run single autonomous iteration
    // If system is currently STOPPED, ensure it is set to RUNNING for this manual step
    setSystemStatus('RUNNING');

    const result = await runAutonomousIteration({
      forceQuestionId: body.forceQuestionId,
      targetCompute: body.targetCompute,
    });

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Autonomous iteration failed', details: msg }, { status: 500 });
  }
}

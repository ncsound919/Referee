import { NextResponse } from 'next/server';
import { runAutonomousIteration } from '@/lib/autonomous-orchestrator';

export async function POST() {
  try {
    const result = await runAutonomousIteration();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Autonomous iteration failed' }, { status: 500 });
  }
}

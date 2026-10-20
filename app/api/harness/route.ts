import { NextRequest, NextResponse } from 'next/server';
import { getHarnessEntries, runHeldOutHarnessValidation } from '@/lib/harness-library';

export async function GET() {
  const harnesses = getHarnessEntries();
  return NextResponse.json({
    total: harnesses.length,
    harnesses,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, harness_id } = body;

    if (action === 'validate_held_out' && harness_id) {
      const res = runHeldOutHarnessValidation(harness_id);
      return NextResponse.json({
        success: true,
        ...res,
      });
    }

    return NextResponse.json({ error: 'Unknown action or missing harness_id' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

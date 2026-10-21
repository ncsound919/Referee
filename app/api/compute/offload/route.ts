import { NextResponse } from 'next/server';

const ALLOWED_TARGETS = new Set(['tumortwin', 'cloudflare', 'kaggle']);

export async function POST(req: Request) {
  try {
    const { target, task } = await req.json();

    if (!target || !ALLOWED_TARGETS.has(target)) {
      return NextResponse.json(
        { error: `Invalid compute offload target '${target}'. Allowed: ${Array.from(ALLOWED_TARGETS).join(', ')}` },
        { status: 400 }
      );
    }

    if (!task || typeof task !== 'object') {
      return NextResponse.json({ error: 'Valid task payload object is required' }, { status: 400 });
    }

    if (target === 'tumortwin') {
      const engineUrl = process.env.ENGINE_URL || 'http://localhost:8000';
      const res = await fetch(`${engineUrl}/run_experiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!res.ok) {
        return NextResponse.json({ error: `Engine returned HTTP ${res.status}` }, { status: res.status });
      }
      const data = await res.json();
      return NextResponse.json({ result: data });
    } else {
      // Cloudflare / Kaggle worker stub
      return NextResponse.json({ result: { status: 'queued', target } });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Compute offload failed', details: msg }, { status: 500 });
  }
}

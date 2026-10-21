import { NextRequest, NextResponse } from 'next/server';
import { offloadToCloudflareWorker, runKaggleKernel, verifyComputeSystems } from '@/lib/integrations/offload';
import { requireOperator } from '@/lib/internal-auth';

const ALLOWED_TARGETS = new Set(['tumortwin', 'cloudflare', 'kaggle']);

/**
 * GET /api/compute/offload
 * Return connection and verification status of all compute backends
 * (Cloudflare Workers/AI/R2, Kaggle multi-account cluster, etc.)
 */
export async function GET(req: Request) {
  const guard = await requireOperator(req);
  if (guard) return guard;

  try {
    const status = await verifyComputeSystems();
    return NextResponse.json({ status: 'ok', backends: status });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to verify compute systems', details: msg }, { status: 500 });
  }
}

/**
 * POST /api/compute/offload
 * Offload compute workloads to TumorTwin, Cloudflare, or Kaggle
 */
export async function POST(req: Request) {
  const guard = await requireOperator(req);
  if (guard) return guard;
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
    }

    if (target === 'cloudflare') {
      const result = await offloadToCloudflareWorker(task);
      return NextResponse.json({ result });
    }

    if (target === 'kaggle') {
      const kernelName = typeof task.kernelName === 'string' ? task.kernelName : (task.id || 'referee-audit-job');
      const result = await runKaggleKernel(kernelName, task);
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: 'Unhandled compute target' }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Compute offload failed', details: msg }, { status: 500 });
  }
}

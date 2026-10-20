import { NextResponse } from 'next/server';
import { offloadToCloudflareWorker, runKaggleKernel } from '@/lib/integrations/offload';

export async function POST(req: Request) {
  const { target, task } = await req.json();

  try {
    if (target === 'tumortwin') {
      // Direct call to FastAPI engine
      const res = await fetch('http://localhost:8000/run_experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      return NextResponse.json({ result: data });
    } else {
        // Placeholder/Stub
        return NextResponse.json({ result: { status: 'queued' } });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Compute offload failed' }, { status: 500 });
  }
}

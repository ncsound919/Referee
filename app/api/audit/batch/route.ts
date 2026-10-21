import { NextRequest, NextResponse } from 'next/server';
import { requireOperator } from '@/lib/internal-auth';
import { tryGetCoreClient } from '@/lib/integrations/referee-core-client';

const MAX_BATCH_SIZE = 10;
const CONCURRENCY = 3;

/**
 * POST /api/audit/batch
 *
 * Audit multiple claims. Each entry must carry a prediction CSV; the
 * deterministic referee-core engine is the only source of verdicts.
 *
 * Request body:
 *   { claims: Array<{ claim: ClaimSpec, csv_text: string, policy?: object }> }
 *
 * Response:
 *   { total, results: Array<{ index, claim_id, source, ...report }> }
 */
export async function POST(req: NextRequest) {
  const guard = await requireOperator(req);
  if (guard) return guard;

  try {
    const body = await req.json();

    if (!Array.isArray(body.claims)) {
      return NextResponse.json(
        { error: 'Request body must contain a "claims" array of {claim, csv_text} objects.' },
        { status: 400 }
      );
    }

    const claims = body.claims;

    if (claims.length === 0) {
      return NextResponse.json({ error: 'claims array must not be empty.' }, { status: 400 });
    }

    if (claims.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size ${claims.length} exceeds maximum of ${MAX_BATCH_SIZE}.` },
        { status: 400 }
      );
    }

    for (let i = 0; i < claims.length; i++) {
      const c = claims[i];
      if (!c || typeof c !== 'object') {
        return NextResponse.json({ error: `claims[${i}] must be an object.` }, { status: 400 });
      }
      if (!c.claim || !c.claim.claim_id || !c.claim.claimed_metric) {
        return NextResponse.json(
          { error: `claims[${i}].claim is missing required fields: claim_id, claimed_metric.` },
          { status: 400 }
        );
      }
      if (typeof c.csv_text !== 'string' || c.csv_text.trim() === '') {
        return NextResponse.json(
          { error: `claims[${i}].csv_text is required (a prediction CSV).` },
          { status: 422 }
        );
      }
    }

    const coreClient = tryGetCoreClient();
    if (!coreClient) {
      return NextResponse.json(
        {
          status: 'ENGINE_UNAVAILABLE',
          error: 'referee-core is not configured (REFEREE_CORE_URL unset).',
        },
        { status: 503 }
      );
    }

    const results: unknown[] = [];
    for (let i = 0; i < claims.length; i += CONCURRENCY) {
      const wave = claims.slice(i, i + CONCURRENCY);
      const waveResults = await Promise.all(
        wave.map(async (entry: { claim: Record<string, unknown>; csv_text: string; policy?: Record<string, unknown> }, waveIdx: number) => {
          try {
            const report = await coreClient.audit(
              entry.claim,
              entry.csv_text,
              entry.policy
            );
            return { index: i + waveIdx, source: 'referee-core', ...report, claim_id: entry.claim.claim_id };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              index: i + waveIdx,
              claim_id: entry.claim.claim_id,
              success: false,
              error: msg,
            };
          }
        })
      );
      results.push(...waveResults);
    }

    return NextResponse.json({ total: results.length, results });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

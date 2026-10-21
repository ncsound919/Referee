import { NextRequest, NextResponse } from 'next/server';
import { executeAuditPipeline } from '@/lib/orchestrator';
import { ClaimSpec } from '@/lib/types';

const MAX_BATCH_SIZE = 10;
const CONCURRENCY = 3;

/**
 * POST /api/audit/batch
 *
 * Audit multiple ClaimSpecs in a single request. Executes up to CONCURRENCY
 * audits in parallel; remaining items are queued and processed in subsequent
 * waves. Maximum batch size: MAX_BATCH_SIZE claims.
 *
 * Request body:
 *   { claims: ClaimSpec[] }
 *
 * Response:
 *   { total, results: AuditRunOutput[] }
 *
 * Each result includes `success`, `terminalMessage`, `auditResults`, and
 * `verdictRecord` (when provenance is "computed" and ledger commit succeeded).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!Array.isArray(body.claims)) {
      return NextResponse.json(
        { error: 'Request body must contain a "claims" array of ClaimSpec objects.' },
        { status: 400 }
      );
    }

    const claims: ClaimSpec[] = body.claims;

    if (claims.length === 0) {
      return NextResponse.json({ error: 'claims array must not be empty.' }, { status: 400 });
    }

    if (claims.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size ${claims.length} exceeds maximum of ${MAX_BATCH_SIZE}.` },
        { status: 400 }
      );
    }

    // Validate that every entry looks like a ClaimSpec (has claim_id and claimed_metric)
    for (let i = 0; i < claims.length; i++) {
      const c = claims[i];
      if (!c || !c.claim_id || !c.claimed_metric) {
        return NextResponse.json(
          { error: `claims[${i}] is missing required fields: claim_id, claimed_metric.` },
          { status: 400 }
        );
      }
    }

    // Run in bounded-concurrency waves
    const results: unknown[] = [];
    for (let i = 0; i < claims.length; i += CONCURRENCY) {
      const wave = claims.slice(i, i + CONCURRENCY);
      const waveResults = await Promise.all(
        wave.map(async (claimSpec, waveIdx) => {
          try {
            const output = await executeAuditPipeline(claimSpec);
            return { index: i + waveIdx, claim_id: claimSpec.claim_id, ...output };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              index: i + waveIdx,
              claim_id: claimSpec.claim_id,
              success: false,
              terminalMessage: `Internal error: ${msg}`,
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

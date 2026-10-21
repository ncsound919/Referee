import { NextRequest, NextResponse } from 'next/server';
import { requireOperator } from '@/lib/internal-auth';
import { ClaimSpec } from '@/lib/types';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import { extractClaimSpecWithGemini } from '@/lib/gemini-referee';
import { tryGetCoreClient } from '@/lib/integrations/referee-core-client';

export async function POST(req: NextRequest) {
  const guard = await requireOperator(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    let claimSpec: ClaimSpec;

    // Check if user chose a predefined benchmark sample
    if (body.sample_id && SAMPLE_CLAIMS[body.sample_id]) {
      claimSpec = JSON.parse(JSON.stringify(SAMPLE_CLAIMS[body.sample_id]));
      if (body.overrides) {
        claimSpec = { ...claimSpec, ...body.overrides };
      }
    } else if (body.claim_spec) {
      claimSpec = body.claim_spec;
    } else if (body.raw_text) {
      // Use Generator agent to extract draft ClaimSpec for human review
      const extraction = await extractClaimSpecWithGemini(body.raw_text);

      if (!body.confirm_draft) {
        return NextResponse.json({
          status: 'DRAFT_SPEC_EXTRACTED',
          requiresConfirmation: true,
          draftClaimSpec: extraction.claimSpec,
          missing_fields: extraction.claimSpec?.missing_fields || [],
          message:
            'Draft ClaimSpec extracted from text. Confirm or complete missing fields before executing deterministic audit; unconfirmed text is never auto-audited with fabricated defaults.',
        });
      }

      if (!extraction.claimSpec || !extraction.claimSpec.title || !extraction.claimSpec.claimed_metric) {
        return NextResponse.json(
          {
            error:
              'Cannot audit raw text: required fields (title, claimed_metric) could not be verified. Missing fields are unverifiable, not guessed.',
            missing_fields: extraction.claimSpec?.missing_fields || [],
          },
          { status: 400 }
        );
      }

      claimSpec = extraction.claimSpec as ClaimSpec;
    } else {
      return NextResponse.json(
        { error: 'Provide either sample_id, claim_spec, or raw_text to audit.' },
        { status: 400 }
      );
    }

    // --- Fail-closed: a real prediction table + the deterministic engine are required. ---
    // Simulated heuristic verdicts are no longer returned from this endpoint.
    if (typeof body.csv_text !== 'string' || body.csv_text.trim() === '') {
      return NextResponse.json(
        {
          status: 'UNVERIFIABLE',
          error:
            'A prediction CSV (csv_text) is required. The audit engine refuses to produce a verdict without a table; simulated heuristic results are not returned.',
        },
        { status: 409 }
      );
    }

    const coreClient = tryGetCoreClient();
    if (!coreClient) {
      return NextResponse.json(
        {
          status: 'ENGINE_UNAVAILABLE',
          error:
            'referee-core is not configured (REFEREE_CORE_URL unset). The audit engine refuses to produce a verdict without the deterministic Python core.',
        },
        { status: 503 }
      );
    }

    try {
      const coreResult = await coreClient.audit(
        claimSpec as unknown as Record<string, unknown>,
        body.csv_text as string,
        body.policy as Record<string, unknown> | undefined
      );
      return NextResponse.json({ source: 'referee-core', ...coreResult });
    } catch (coreErr) {
      console.warn('[audit] referee-core call failed, refusing fabricated fallback:', coreErr);
      return NextResponse.json(
        {
          status: 'ENGINE_UNAVAILABLE',
          error: `referee-core audit failed: ${coreErr instanceof Error ? coreErr.message : String(coreErr)}`,
        },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

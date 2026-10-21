import { NextRequest, NextResponse } from 'next/server';
import { executeAuditPipeline } from '@/lib/orchestrator';
import { ClaimSpec } from '@/lib/types';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import { extractClaimSpecWithGemini, generateAuditorCritiqueWithGemini } from '@/lib/gemini-referee';
import { tryGetCoreClient } from '@/lib/integrations/referee-core-client';

export async function POST(req: NextRequest) {
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
          missing_fields: extraction.missingFields || extraction.claimSpec?.missing_fields || [],
          message:
            'Draft ClaimSpec extracted from text. Confirm or complete missing fields before executing deterministic audit; unconfirmed text is never auto-audited with fabricated defaults.',
        });
      }

      if (!extraction.claimSpec || !extraction.claimSpec.title || !extraction.claimSpec.claimed_metric) {
        return NextResponse.json(
          {
            error:
              'Cannot audit raw text: required fields (title, claimed_metric) could not be verified. Missing fields are unverifiable, not guessed.',
            missing_fields: extraction.missingFields,
          },
          { status: 400 }
        );
      }

      claimSpec = extraction.claimSpec;
    } else {
      return NextResponse.json(
        { error: 'Provide either sample_id, claim_spec, or raw_text to audit.' },
        { status: 400 }
      );
    }

    // Attempt to route through the referee-core Python engine if configured.
    // When csv_text is supplied and the engine is reachable, use deterministic Python scoring.
    if (body.csv_text && typeof body.csv_text === 'string') {
      const coreClient = tryGetCoreClient();
      if (coreClient) {
        try {
          const coreResult = await coreClient.audit(
            claimSpec as unknown as Record<string, unknown>,
            body.csv_text as string,
            body.policy as Record<string, unknown> | undefined
          );
          return NextResponse.json({ source: 'referee-core', ...coreResult });
        } catch (coreErr) {
          // Fall through to heuristic pipeline if engine call fails.
          console.warn('[audit] referee-core call failed, falling back to heuristic pipeline:', coreErr);
        }
      }
    }

    // Optional LLM Auditor statement
    const customAuditorStatement: string | undefined = undefined;

    // Execute the deterministic orchestrator pipeline
    const output = await executeAuditPipeline(claimSpec, {
      customAuditorStatement,
    });

    // If Gemini is active, generate advisory note without mutating cryptographic ledger record
    if (output.success && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      try {
        const auditorNote = await generateAuditorCritiqueWithGemini(output.auditResults);
        if (auditorNote) {
          (output as Record<string, unknown>).llmCritiqueAdvisory = auditorNote;
        }
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json(output);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

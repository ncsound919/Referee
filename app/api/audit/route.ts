import { NextRequest, NextResponse } from 'next/server';
import { executeAuditPipeline } from '@/lib/orchestrator';
import { ClaimSpec } from '@/lib/types';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import { extractClaimSpecWithGemini, generateAuditorCritiqueWithGemini } from '@/lib/gemini-referee';

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
      // Use Generator agent to extract ClaimSpec
      const extraction = await extractClaimSpecWithGemini(body.raw_text);
      if (extraction.claimSpec && extraction.claimSpec.title) {
        claimSpec = {
          claim_id: extraction.claimSpec.claim_id || `claim_${Date.now()}`,
          title: extraction.claimSpec.title,
          authors: extraction.claimSpec.authors || ['Anonymous / Extracted'],
          publication_reference: extraction.claimSpec.publication_reference || { year: 2026 },
          repository_url: extraction.claimSpec.repository_url || 'https://github.com/extracted-repo',
          dataset_id: extraction.claimSpec.dataset_id || 'METABRIC',
          intended_use: extraction.claimSpec.intended_use || 'research',
          user_role: extraction.claimSpec.user_role || 'academic',
          institutional_affiliation: extraction.claimSpec.institutional_affiliation || 'Extracted Institution',
          domain_task: extraction.claimSpec.domain_task || 'breast_transcriptomic_metastasis',
          claimed_metric: extraction.claimSpec.claimed_metric || { name: 'AUC', value: 0.75, split_type: 'random' },
          split_description: extraction.claimSpec.split_description,
          patient_identifier_field: extraction.claimSpec.patient_identifier_field,
          missing_fields: extraction.claimSpec.missing_fields || [],
          raw_claim_text: body.raw_text,
        };
      } else {
        // Fallback default claim if extraction did not return structured object
        claimSpec = {
          claim_id: `claim_${Date.now()}`,
          title: 'Unstructured Extracted Claim',
          authors: ['Extracted Author'],
          publication_reference: { year: 2026 },
          repository_url: 'https://github.com/extracted/repo',
          dataset_id: 'METABRIC',
          intended_use: 'research',
          user_role: 'academic',
          institutional_affiliation: 'Academic Medical Center',
          domain_task: 'breast_transcriptomic_metastasis',
          claimed_metric: { name: 'AUC', value: 0.78, split_type: 'Random CV' },
          split_description: body.raw_text.slice(0, 150),
          missing_fields: [],
          raw_claim_text: body.raw_text,
        };
      }
    } else {
      return NextResponse.json(
        { error: 'Provide either sample_id, claim_spec, or raw_text to audit.' },
        { status: 400 }
      );
    }

    // Optional LLM Auditor statement
    let customAuditorStatement: string | undefined;
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      try {
        // Generate pre-assessment or critique
      } catch {
        // Fall back gracefully
      }
    }

    // Execute the deterministic orchestrator pipeline
    const output = await executeAuditPipeline(claimSpec, {
      customAuditorStatement,
    });

    // If Gemini is active, run the Auditor agent on the AuditResults
    if (output.success && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      try {
        const auditorNote = await generateAuditorCritiqueWithGemini(output.auditResults);
        if (auditorNote && output.verdictRecord) {
          output.verdictRecord.verdict_statement = `${auditorNote}\n\n[Deterministic Engine Statement]: ${output.verdictRecord.verdict_statement}`;
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

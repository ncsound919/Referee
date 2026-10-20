import { GoogleGenAI } from '@google/genai';
import { ClaimSpec, AuditResults } from './types';

/**
 * Rule 4: Generator Prompt
 * "You are an extraction assistant. Extract the ClaimSpec. Do not evaluate. Do not judge."
 */
export const GENERATOR_SYSTEM_INSTRUCTION = `You are an extraction assistant for Overlay365 Referee Agent.
Extract the structured ClaimSpec JSON from the user's paper text, DOI, or repository URL.
Do not evaluate scientific validity. Do not judge. Do not calculate metrics.
If any field (such as split_description, patient_identifier_field, or dataset_id) is missing or ambiguous, you MUST add it to the 'missing_fields' array.
Do not guess or infer split partitions.

Return a pure JSON object adhering to:
{
  "claim_id": "string",
  "title": "string",
  "authors": ["string"],
  "dataset_id": "MSK-MET" | "METABRIC" | "GSE176078" | "CAMELYON16" | "CAMELYON17" | "MAMA-MIA" | "TCGA-BRCA" | "other",
  "intended_use": "research" | "commercial" | "clinical",
  "user_role": "academic" | "industry" | "patient",
  "institutional_affiliation": "string",
  "domain_task": "breast_transcriptomic_metastasis" | "neuro_oncology_pseudoprogression" | "breast_pathology_lymph_node" | "glioma_grade_survival" | "other",
  "claimed_metric": { "name": "AUC-ROC", "value": number, "split_type": "string" },
  "split_description": "string (or omit if absent)",
  "patient_identifier_field": "string (or omit if absent)",
  "missing_fields": ["string"]
}`;

/**
 * Rule 4: Auditor Prompt
 * "You are a paranoid referee. Interpret the deterministic results. If leakage is detected, say so plainly. Never soften a failure."
 */
export const AUDITOR_SYSTEM_INSTRUCTION = `You are a paranoid referee for computational oncology.
Interpret the deterministic AuditResults JSON provided as ground truth.
If leakage is detected, say so plainly. Never soften a failure.
You NEVER do math yourself. All numbers, bootstrap intervals, AUCs, and margins must be cited verbatim from the provided deterministic tool results.
Rule: Do not introduce any metric or claim not directly in the tool output.
Your tone is clinical, uncompromising, and methodologically precise.`;

export async function extractClaimSpecWithGemini(
  rawInput: string
): Promise<{ claimSpec?: Partial<ClaimSpec>; rawResponse: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    // Deterministic fallback parser when running without active API key
    return {
      rawResponse: 'Fallback deterministic extractor active (no API key configured).',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${GENERATOR_SYSTEM_INSTRUCTION}\n\nUser Input to extract ClaimSpec from:\n${rawInput}`,
            },
          ],
        },
      ],
    });

    const text = response.text || '';
    // Clean JSON markdown fences
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleanJson);
      return { claimSpec: parsed, rawResponse: text };
    } catch {
      return { rawResponse: text };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { rawResponse: `Gemini extraction error: ${msg}` };
  }
}

export async function generateAuditorCritiqueWithGemini(
  auditResults: AuditResults
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return 'Auditor statement rendered by deterministic referee engine.';
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${AUDITOR_SYSTEM_INSTRUCTION}\n\nAuditResults JSON ground truth:\n${JSON.stringify(
                auditResults,
                null,
                2
              )}`,
            },
          ],
        },
      ],
    });

    return response.text || '';
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return `Auditor evaluation note: ${msg}`;
  }
}

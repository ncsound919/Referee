/**
 * referee-core-client.ts
 *
 * Typed HTTP client for the referee-core FastAPI engine.
 *
 * Usage:
 *   import { RefereeCoreClient } from '@/lib/integrations/referee-core-client';
 *   const client = new RefereeCoreClient(process.env.REFEREE_CORE_URL);
 *   const result = await client.audit(claimSpec, csvText);
 *
 * When REFEREE_CORE_URL is not configured the client throws RefereeCoreUnavailableError,
 * allowing the caller to fall back to the in-process heuristic tools.
 */

export class RefereeCoreUnavailableError extends Error {
  constructor(msg = 'REFEREE_CORE_URL is not configured') {
    super(msg);
    this.name = 'RefereeCoreUnavailableError';
  }
}

export interface CoreAuditRequest {
  claim: Record<string, unknown>;
  csv_text: string;
  policy?: Record<string, unknown>;
}

export interface CoreAuditResponse {
  verdict: string;
  reasons?: string[];
  dimensions: Record<string, string>;
  evidence: Record<string, unknown>;
  input_sha256: string;
  decision_sha256: string;
  report_sha256?: string;
  software?: { referee_core?: string; numpy?: string; scipy?: string; 'scikit-learn'?: string };
  disposition?: string;
  // verdict_statement / claim_id are derived by callers; the engine returns
  // claim + policy + report_version at the top level (see openapi.json).
  verdict_statement?: string;
  claim_id?: string;
  [key: string]: unknown;
}

export interface CoreVerifyResponse {
  valid: boolean;
}

export interface CorePreCheckRequest {
  dataset_ids: string[];
  user_role: string;
  pipeline_skills: string[];
}

export interface CorePreCheckResponse {
  status: 'PASSED' | 'REJECTED';
  reason?: string;
}

export class RefereeCoreClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const url = baseUrl || process.env.REFEREE_CORE_URL || '';
    if (!url) {
      throw new RefereeCoreUnavailableError();
    }
    // Strip trailing slash for consistent URL construction.
    this.baseUrl = url.replace(/\/$/, '');
  }

  /** Check if the engine is reachable (health check). */
  static isConfigured(): boolean {
    return Boolean(process.env.REFEREE_CORE_URL);
  }

  /**
   * POST /audit
   * Submit a ClaimSpec + prediction CSV for deterministic scoring.
   */
  async audit(
    claim: Record<string, unknown>,
    csvText: string,
    policy?: Record<string, unknown>
  ): Promise<CoreAuditResponse> {
    // Normalize claim fields to match referee_core.schema.ClaimSpec
    const normalizedClaim: Record<string, unknown> = {
      claim_id: claim.claim_id,
      title: claim.title || '',
      claimed_auc:
        claim.claimed_auc ??
        (claim.claimed_metric && typeof (claim.claimed_metric as Record<string, unknown>).value === 'number'
          ? (claim.claimed_metric as Record<string, unknown>).value
          : undefined),
      eval_on: claim.eval_on || 'test',
      score_is_probability: Boolean(claim.score_is_probability),
    };
    if (claim.split_description) {
      normalizedClaim.split_description = claim.split_description;
    }
    if (claim.claimed_auc_ci) {
      normalizedClaim.claimed_auc_ci = claim.claimed_auc_ci;
    }

    const body: CoreAuditRequest = { claim: normalizedClaim, csv_text: csvText, ...(policy ? { policy } : {}) };
    const res = await this._post('/audit', body);
    return res as CoreAuditResponse;
  }

  /**
   * POST /verify
   * Verify an existing audit report (optionally with original CSV for re-audit).
   */
  async verify(report: Record<string, unknown>, csvText?: string): Promise<CoreVerifyResponse> {
    const body: Record<string, unknown> = { report, ...(csvText ? { csv_text: csvText } : {}) };
    const res = await this._post('/verify', body);
    return res as CoreVerifyResponse;
  }

  /**
   * POST /pre_check
   * Validate dataset licences and skill names before running a hypothesis pipeline.
   */
  async preCheck(req: CorePreCheckRequest): Promise<CorePreCheckResponse> {
    const res = await this._post('/pre_check', req);
    return res as CorePreCheckResponse;
  }

  /**
   * POST /run_experiment
   * Dispatch a ManifestSnapshot to a registered compute adapter (e.g. TumorTwin).
   * Caller is responsible for computing SHA-256 of snapshot_json before calling.
   */
  async runExperiment(engineName: string, snapshotJson: string, sha256: string, workspace?: string): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { engine_name: engineName, snapshot_json: snapshotJson, sha256, ...(workspace ? { workspace } : {}) };
    const res = await this._post('/run_experiment', body);
    return res as Record<string, unknown>;
  }

  private async _post(path: string, body: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new RefereeCoreUnavailableError(`referee-core unreachable at ${this.baseUrl}${path}: ${err}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`referee-core ${path} returned ${res.status}: ${text}`);
    }
    return res.json();
  }
}

/**
 * Convenience factory — returns null if REFEREE_CORE_URL is not configured
 * so callers can do: `const client = tryGetCoreClient(); if (client) { ... }`.
 */
export function tryGetCoreClient(): RefereeCoreClient | null {
  try {
    return new RefereeCoreClient();
  } catch {
    return null;
  }
}

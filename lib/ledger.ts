import { VerdictRecord, VerdictType, OncologyDomainTask, AuthorResponse } from './types';
import { syncHash } from './crypto-utils';

export const UNIVERSAL_CLAIM_LIMIT =
  'NON-DISMISSIBLE NOTICE: This audit strictly evaluates computational reproducibility, domain-specific leakage resistance, and statistical calibration against deterministic baselines. It does NOT establish clinical utility, biological truth, safety for patient care, or external real-world trial success.';

const INITIAL_LEDGER: VerdictRecord[] = [
  {
    verdict_id: 'vrd_genesis_0001',
    claim_id: 'claim_oct2026_bonemets',
    timestamp: '2026-10-14T09:30:00.000Z',
    block_height: 1,
    previous_block_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    sha256_hash: '9a7c8e41bf3d29f8a421b8c6e2a9b31d45f8e07a12c49e7b23d90f14a8b7c6d5',
    verdict: 'FAILS_BASELINE',
    title: 'Breast Cancer Bone Metastasis 42-Gene Transcriptomic Signature',
    verdict_statement:
      'The claimed transcriptomic classifier fails the domain-aware baseline harness. While reported internal cross-validation claimed AUC 0.795, test performance on independent multi-center cohorts collapses to AUC 0.512, failing to outperform simple Clinical-Only Cox baseline (AUC 0.641). Rigorous negative result verified and archived.',
    domain_task: 'breast_transcriptomic_metastasis',
    dataset_id: 'METABRIC',
    scopeTested: ['Computational reproducibility', 'ElasticNet/RF/XGBoost baselines', 'Batch effect invariance', 'Brier calibration'],
    scopeNotTested: ['Prospective therapeutic selection', 'In vitro biological mechanism', 'Wet-lab bone microenvironment invasion'],
    universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
    evidenceLinks: {
      claimSpecHash: '4f2e91b8a7c63d50123e4a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d',
      auditResultsHash: '8b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c',
      ledgerRecordHash: '9a7c8e41bf3d29f8a421b8c6e2a9b31d45f8e07a12c49e7b23d90f14a8b7c6d5',
      datasetId: 'METABRIC-EGA-00083',
      repositorySnapshot: 'github.com/oncology-reproducibility-archive/oct2026-bonemets-audit',
      rawLogUrl: '/audit-logs/claim_oct2026_bonemets.json',
    },
    tool_invocations: 4,
    license_status: 'PASSED',
    baseline_margin: -0.129,
    leakage_summary: 'Batch confound R² = 0.448 detected across sequencing runs, explaining artificial internal CV inflation.',
    author_responses: [
      {
        response_id: 'auth_resp_001',
        author_name: 'Lead Author Consortium (Oct 2026)',
        timestamp: '2026-10-16T14:12:00.000Z',
        text: 'We acknowledge the audit findings. The collapse from CV AUC 0.795 to 0.512 on external holdout illustrates the profound role of institutional batch confounds in bone metastasis signatures. We endorse this negative result being placed on the permanent ledger.',
        sha256_hash: '1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d',
      },
    ],
    raw_audit_results: {},
  },
  {
    verdict_id: 'vrd_0002_pseudoprog',
    claim_id: 'claim_glio_mri_deepnet',
    timestamp: '2026-10-17T11:45:00.000Z',
    block_height: 2,
    previous_block_hash: '9a7c8e41bf3d29f8a421b8c6e2a9b31d45f8e07a12c49e7b23d90f14a8b7c6d5',
    sha256_hash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
    verdict: 'LEAKAGE_DETECTED',
    title: 'Multimodal 3D ResNet for Glioblastoma Pseudoprogression Differentiation',
    verdict_statement:
      'Audit terminated due to critical domain-specific data leakage: serial MRI scans from the same subject co-occur in both pre-treatment and post-treatment evaluation folds (patient × timepoint overlap = 34%). Furthermore, scanner manufacturer nuisance classifier predicts outcome with AUC 0.812.',
    domain_task: 'neuro_oncology_pseudoprogression',
    dataset_id: 'TCGA-BRCA',
    scopeTested: ['Patient-level data separation', 'Scanner acquisition bias', 'Clinical-only feature baseline comparison'],
    scopeNotTested: ['Histopathological re-biopsy confirmation', 'Clinical efficacy of salvage bevacizumab'],
    universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
    evidenceLinks: {
      claimSpecHash: '5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f',
      auditResultsHash: '2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b',
      ledgerRecordHash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
      datasetId: 'TCGA-LGG-GBM-MRI',
      repositorySnapshot: 'github.com/neuro-imaging-lab/pseudo-prog-resnet3d',
      rawLogUrl: '/audit-logs/claim_glio_mri_deepnet.json',
    },
    tool_invocations: 3,
    license_status: 'PASSED',
    leakage_summary: 'NEURO_PATIENT_TIMEPOINT_OVERLAP: 34% patient co-occurrence across longitudinal splits; MRI_SCANNER_NUISANCE_CONFOUND: AUC 0.812.',
    author_responses: [],
    raw_audit_results: {},
  },
  {
    verdict_id: 'vrd_0003_camelyon_node',
    claim_id: 'claim_camelyon17_patchnet',
    timestamp: '2026-10-18T16:20:00.000Z',
    block_height: 3,
    previous_block_hash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
    sha256_hash: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
    verdict: 'FAILS_BASELINE',
    title: 'Self-Supervised Vision Transformer for CAMELYON17 Center Generalization',
    verdict_statement:
      'The proposed Vision Transformer model fails to exceed the locked center-held-out benchmark. Claimed AUC 0.772 is surpassed by the locked Multiple Instance Learning baseline (CLAM AUC 0.798) on center 5.',
    domain_task: 'breast_pathology_lymph_node',
    dataset_id: 'CAMELYON17',
    scopeTested: ['Multi-center generalizability', 'Out-of-distribution stainer shift', 'Center-5 held-out evaluation'],
    scopeNotTested: ['Rare micrometastasis subtyping', 'Whole slide scanner hardware calibration'],
    universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
    evidenceLinks: {
      claimSpecHash: '7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
      auditResultsHash: '3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e',
      ledgerRecordHash: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
      datasetId: 'CAMELYON17-CC0',
      repositorySnapshot: 'github.com/computational-pathology/vit-camelyon17',
      rawLogUrl: '/audit-logs/claim_camelyon17_patchnet.json',
    },
    tool_invocations: 4,
    license_status: 'PASSED',
    baseline_margin: -0.026,
    author_responses: [],
    raw_audit_results: {},
  },
  {
    verdict_id: 'vrd_0004_gse_tnbc',
    claim_id: 'claim_gse176078_tnbc_pass',
    timestamp: '2026-10-19T08:15:00.000Z',
    block_height: 4,
    previous_block_hash: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
    sha256_hash: 'f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1',
    verdict: 'REPRODUCED',
    title: 'TNBC Neoadjuvant Chemoresistance Transcriptomic Signature',
    verdict_statement:
      'The claim successfully satisfies all referee gates. Patient-stratified split verified with 0% patient leakage. Test AUC 0.742 strictly exceeds the best locked baseline (Random Forest AUC 0.690 by +0.052). Negative control gate passed (0.19 <= 0.30) and calibration slope is 0.94.',
    domain_task: 'breast_transcriptomic_metastasis',
    dataset_id: 'GSE176078',
    scopeTested: ['Patient-stratified test split', 'ElasticNet/RF/XGBoost baselines', 'Negative control permutation (0.30 gate)', 'Brier calibration score'],
    scopeNotTested: ['Prospective clinical validation', 'Direct therapeutic decision support'],
    universalClaimLimit: UNIVERSAL_CLAIM_LIMIT,
    evidenceLinks: {
      claimSpecHash: '9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
      auditResultsHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      ledgerRecordHash: 'f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1',
      datasetId: 'GEO-GSE176078',
      repositorySnapshot: 'github.com/tnbc-translational-group/chemo-resistance-sig',
      rawLogUrl: '/audit-logs/claim_gse176078_tnbc_pass.json',
    },
    tool_invocations: 4,
    license_status: 'PASSED',
    baseline_margin: 0.052,
    author_responses: [],
    raw_audit_results: {},
  },
];

// In-memory ledger storage for the session with preloaded historical records
let activeLedger: VerdictRecord[] = [...INITIAL_LEDGER];

export type SystemStatus = 'RUNNING' | 'PAUSED' | 'STOPPED';
let systemStatus: SystemStatus = 'STOPPED';

export function getSystemStatus(): SystemStatus {
  return systemStatus;
}

export function setSystemStatus(status: SystemStatus): void {
  systemStatus = status;
}

export function getLedgerRecords(): VerdictRecord[] {
  return [...activeLedger];
}

export function getLedgerRecordById(verdictId: string): VerdictRecord | undefined {
  return activeLedger.find((r) => r.verdict_id === verdictId);
}

/**
 * Rule 5: Every Verdict Is Written to the Ledger.
 * Computes the SHA-256 hash, chains to previous block, and writes to the ledger.
 */
export function writeVerdictToLedger(
  recordInput: Omit<VerdictRecord, 'verdict_id' | 'block_height' | 'previous_block_hash' | 'sha256_hash'>
): VerdictRecord {
  const previousBlock = activeLedger[activeLedger.length - 1];
  const previousHash = previousBlock
    ? previousBlock.sha256_hash
    : '0000000000000000000000000000000000000000000000000000000000000000';
  const blockHeight = activeLedger.length + 1;
  const verdictId = `vrd_${Date.now()}_b${blockHeight}`;

  const payloadToHash = JSON.stringify({
    verdictId,
    blockHeight,
    previousHash,
    claimId: recordInput.claim_id,
    verdict: recordInput.verdict,
    timestamp: recordInput.timestamp,
    universalClaimLimit: recordInput.universalClaimLimit,
  });

  const blockHash = syncHash(payloadToHash);

  const newRecord: VerdictRecord = {
    ...recordInput,
    verdict_id: verdictId,
    block_height: blockHeight,
    previous_block_hash: previousHash,
    sha256_hash: blockHash,
  };

  activeLedger.push(newRecord);
  return newRecord;
}

/**
 * Appends an independently hashed author rebuttal or commentary to an existing verdict.
 */
export function addAuthorResponseToRecord(
  verdictId: string,
  authorName: string,
  text: string,
  rebuttalUrl?: string
): AuthorResponse | null {
  const record = activeLedger.find((r) => r.verdict_id === verdictId);
  if (!record) return null;

  const timestamp = new Date().toISOString();
  const responseId = `resp_${Date.now()}`;
  const responseHash = syncHash(
    JSON.stringify({ responseId, verdictId, authorName, text, timestamp })
  );

  const response: AuthorResponse = {
    response_id: responseId,
    author_name: authorName,
    timestamp,
    text,
    sha256_hash: responseHash,
    rebuttal_artifact_url: rebuttalUrl,
  };

  if (!record.author_responses) {
    record.author_responses = [];
  }
  record.author_responses.push(response);
  return response;
}

/**
 * Cryptographic audit of the public ledger integrity: verifies that every block
 * points correctly to the previous block's SHA-256 hash.
 */
export function verifyLedgerChain(): { isValid: boolean; verifiedBlocks: number; brokenBlockIndex?: number } {
  for (let i = 1; i < activeLedger.length; i++) {
    const prev = activeLedger[i - 1];
    const curr = activeLedger[i];
    if (curr.previous_block_hash !== prev.sha256_hash) {
      return { isValid: false, verifiedBlocks: i, brokenBlockIndex: i };
    }
  }
  return { isValid: true, verifiedBlocks: activeLedger.length };
}

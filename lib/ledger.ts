import { VerdictRecord, VerdictType, OncologyDomainTask, AuthorResponse } from './types';
import { syncHash } from './crypto-utils';
import { DEMO_LEDGER_FIXTURES, UNIVERSAL_CLAIM_LIMIT } from '../fixtures/demo-ledger';
import { ledgerStore } from './ledger-store';

export { UNIVERSAL_CLAIM_LIMIT, DEMO_LEDGER_FIXTURES };

/**
 * Deterministic Canonical JSON serialization.
 * Ensures consistent serialization matching RFC 8785 / python canonical json
 * by sorting object keys and using minimal delimiters.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes cryptographically verified SHA-256 hash of a ledger block.
 * The payload incorporates ALL fields of the record (verdict, claim, evidence,
 * scope, baseline margin, leakage summary, timestamps, author responses)
 * so that any tampering is immediately detected.
 */
export function computeBlockHash(
  blockHeight: number,
  previousBlockHash: string,
  entry: {
    claim_id: string;
    timestamp: string;
    verdict: VerdictType;
    title: string;
    verdict_statement: string;
    domain_task: OncologyDomainTask;
    dataset_id: string;
    scopeTested: string[];
    scopeNotTested: string[];
    universalClaimLimit: string;
    evidenceLinks: Record<string, unknown>;
    tool_invocations: number;
    license_status: 'PASSED' | 'BLOCKED';
    baseline_margin?: number;
    leakage_summary?: string;
    author_responses?: AuthorResponse[];
    provenance?: string;
    synthetic?: boolean;
  }
): string {
  const blockPayload = {
    block_height: blockHeight,
    previous_block_hash: previousBlockHash,
    claim_id: entry.claim_id,
    timestamp: entry.timestamp,
    verdict: entry.verdict,
    title: entry.title,
    verdict_statement: entry.verdict_statement,
    domain_task: entry.domain_task,
    dataset_id: entry.dataset_id,
    scopeTested: entry.scopeTested,
    scopeNotTested: entry.scopeNotTested,
    universalClaimLimit: entry.universalClaimLimit,
    evidenceLinks: entry.evidenceLinks,
    tool_invocations: entry.tool_invocations,
    license_status: entry.license_status,
    baseline_margin: entry.baseline_margin ?? null,
    leakage_summary: entry.leakage_summary ?? null,
    author_responses: entry.author_responses ?? [],
    provenance: entry.provenance ?? 'computed',
    synthetic: entry.synthetic ?? false,
  };
  return syncHash(canonicalJson(blockPayload));
}

export type SystemStatus = 'RUNNING' | 'PAUSED' | 'STOPPED';
let systemStatus: SystemStatus = 'STOPPED';

export function getSystemStatus(): SystemStatus {
  return systemStatus;
}

export function setSystemStatus(status: SystemStatus): void {
  systemStatus = status;
}

export function getLedgerRecords(): VerdictRecord[] {
  return ledgerStore.getAll();
}

export function getLedgerRecordById(verdictId: string): VerdictRecord | undefined {
  return ledgerStore.getAll().find((r) => r.verdict_id === verdictId);
}

export function resetLedger(initialRecords: VerdictRecord[] = []): void {
  ledgerStore.reset();
  for (const record of initialRecords) {
    ledgerStore.append(record);
  }
}

/**
 * Rule 5: Every Verdict Is Written to the Ledger.
 * Enforces:
 * 1. Simulations cannot be written to the ledger (provenance must not be 'simulated').
 * 2. Full-block cryptographic SHA-256 chaining.
 */
export function writeVerdictToLedger(
  recordInput: Omit<VerdictRecord, 'verdict_id' | 'block_height' | 'previous_block_hash' | 'sha256_hash'>
): VerdictRecord {
  // Reject simulated records from reaching the public immutable evidence ledger
  if (recordInput.provenance === 'simulated' || recordInput.synthetic) {
    throw new Error(
      `Cannot commit simulated verdict to immutable public evidence ledger. Only verified COMPUTED verdicts may be archived.`
    );
  }

  const records = ledgerStore.getAll();
  const previousBlock = records[records.length - 1];
  const previousHash = previousBlock
    ? previousBlock.sha256_hash
    : '0000000000000000000000000000000000000000000000000000000000000000';
  const blockHeight = records.length + 1;
  const verdictId = `vrd_${Date.now()}_b${blockHeight}`;

  const blockHash = computeBlockHash(blockHeight, previousHash, {
    ...recordInput,
    author_responses: recordInput.author_responses || [],
    provenance: recordInput.provenance || 'computed',
    synthetic: false,
  });

  const newRecord: VerdictRecord = {
    ...recordInput,
    verdict_id: verdictId,
    block_height: blockHeight,
    previous_block_hash: previousHash,
    sha256_hash: blockHash,
    provenance: recordInput.provenance || 'computed',
    synthetic: false,
  };

  ledgerStore.append(newRecord);
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
  const records = ledgerStore.getAll();
  const record = records.find((r) => r.verdict_id === verdictId);
  if (!record) return null;

  const timestamp = new Date().toISOString();
  const responseId = `resp_${Date.now()}`;
  const responseHash = syncHash(
    canonicalJson({ responseId, verdictId, authorName, text, timestamp })
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

  // Update record hash after author response append
  record.sha256_hash = computeBlockHash(record.block_height, record.previous_block_hash, record);

  // Re-persist updated records list
  ledgerStore.reset();
  for (const r of records) {
    ledgerStore.append(r);
  }

  return response;
}

/**
 * Cryptographic audit of the public ledger integrity:
 * 1. Verifies that every block points to the previous block's SHA-256 hash.
 * 2. RECOMPUTES the SHA-256 hash of every block from its raw payload and compares
 *    against the stored sha256_hash.
 * If any verdict, statement, baseline margin, or evidence was tampered with,
 * this function immediately returns isValid: false.
 */
export function verifyLedgerChain(chainToVerify?: VerdictRecord[]): {
  isValid: boolean;
  verifiedBlocks: number;
  brokenBlockIndex?: number;
  failureReason?: string;
} {
  const chain = chainToVerify ?? ledgerStore.getAll();
  for (let i = 0; i < chain.length; i++) {
    const curr = chain[i];
    const prev = i > 0 ? chain[i - 1] : null;
    const expectedPrevHash = prev
      ? prev.sha256_hash
      : '0000000000000000000000000000000000000000000000000000000000000000';

    if (curr.previous_block_hash !== expectedPrevHash) {
      return {
        isValid: false,
        verifiedBlocks: i,
        brokenBlockIndex: i,
        failureReason: `Broken previous hash pointer at block #${curr.block_height} (expected ${expectedPrevHash.slice(0, 12)}..., got ${curr.previous_block_hash.slice(0, 12)}...)`,
      };
    }

    const recomputedHash = computeBlockHash(curr.block_height, curr.previous_block_hash, curr);
    if (curr.sha256_hash !== recomputedHash) {
      return {
        isValid: false,
        verifiedBlocks: i,
        brokenBlockIndex: i,
        failureReason: `Tamper detected at block #${curr.block_height}: stored hash (${curr.sha256_hash.slice(0, 12)}...) does not match recomputed SHA-256 digest (${recomputedHash.slice(0, 12)}...)`,
      };
    }
  }

  return { isValid: true, verifiedBlocks: chain.length };
}

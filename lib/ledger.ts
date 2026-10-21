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
    if (typeof obj === 'number' && Number.isFinite(obj)) {
      // Round floats to 6 dp to match referee_core.audit.canonical (avoids BLAS jitter).
      return JSON.stringify(Number(obj.toFixed(6)));
    }
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
  entry: Record<string, unknown>
): string {
  // Hash everything except the stored digest itself, so every field (including
  // raw_audit_results, verdict_id, and any future field) is tamper-evident.
  const { sha256_hash, block_height, previous_block_hash, ...rest } = entry;
  const blockPayload = {
    block_height: blockHeight,
    previous_block_hash: previousBlockHash,
    ...rest,
  };
  return syncHash(canonicalJson(blockPayload));
}

export type { SystemStatus } from './types';
import type { SystemStatus } from './types';
let systemStatus: SystemStatus = 'STOPPED';

export function getSystemStatus(): SystemStatus {
  return systemStatus;
}

export function setSystemStatus(status: SystemStatus): void {
  systemStatus = status;
}

function isResponseBlock(r: Record<string, unknown>): boolean {
  return r?.type === 'author_response';
}

function dedupeResponses(list: AuthorResponse[]): AuthorResponse[] {
  const seen = new Set<string>();
  const out: AuthorResponse[] = [];
  for (const r of list) {
    if (seen.has(r.response_id)) continue;
    seen.add(r.response_id);
    out.push(r);
  }
  return out;
}

export function getLedgerRecords(): VerdictRecord[] {
  const all = ledgerStore.getAll() as Array<Record<string, unknown>>;
  const verdicts = all.filter((r) => !isResponseBlock(r));
  const responsesByVerdict = new Map<string, AuthorResponse[]>();
  for (const r of all) {
    if (!isResponseBlock(r)) continue;
    const vId = r.verdict_id as string | undefined;
    const resp = r.response as AuthorResponse | undefined;
    if (vId && resp) {
      const list = responsesByVerdict.get(vId) ?? [];
      list.push(resp);
      responsesByVerdict.set(vId, list);
    }
  }
  return verdicts.map((v) => ({
    ...(v as object),
    author_responses: dedupeResponses([
      ...((v.author_responses as AuthorResponse[] | undefined) ?? []),
      ...(responsesByVerdict.get(v.verdict_id as string) ?? []),
    ]),
  })) as VerdictRecord[];
}

export function getLedgerRecordById(verdictId: string): VerdictRecord | undefined {
  return getLedgerRecords().find((r) => r.verdict_id === verdictId);
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

  // A "computed" verdict must be anchored to a real referee-core report hash.
  // Without it, the ledger could record a measurement that no engine produced.
  if (recordInput.provenance === 'computed' && !recordInput.report_sha256) {
    throw new Error(
      `Cannot commit a computed verdict without an engine report hash (report_sha256). ` +
      `Only deterministic referee-core results may be anchored as computed.`
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
    verdict_id: verdictId,
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

  const previousBlock = records[records.length - 1];
  const previousHash = previousBlock
    ? previousBlock.sha256_hash
    : '0000000000000000000000000000000000000000000000000000000000000000';
  const blockHeight = records.length + 1;

  const responseBlock = {
    type: 'author_response',
    verdict_id: verdictId,
    response,
    block_height: blockHeight,
    previous_block_hash: previousHash,
    sha256_hash: '', // filled below
  };
  responseBlock.sha256_hash = computeBlockHash(blockHeight, previousHash, responseBlock);

  ledgerStore.append(responseBlock as unknown as VerdictRecord);

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

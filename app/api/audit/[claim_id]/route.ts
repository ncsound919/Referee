import { NextRequest, NextResponse } from 'next/server';
import { getLedgerRecords } from '@/lib/ledger';

/**
 * GET /api/audit/:claim_id
 *
 * Retrieve all ledger verdict records for a given claim_id.
 * Useful for async polling patterns — clients POST to /api/audit to start,
 * then GET /api/audit/:claim_id to retrieve the committed result.
 *
 * Returns:
 *   200 { claim_id, total, records }  — one or more records found
 *   404 { error }                     — no records for this claim_id
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ claim_id: string }> }
) {
  const { claim_id } = await params;

  if (!claim_id || claim_id.trim().length === 0) {
    return NextResponse.json({ error: 'claim_id is required' }, { status: 400 });
  }

  const all = getLedgerRecords();
  const matching = all.filter((r) => r.claim_id === claim_id.trim());

  if (matching.length === 0) {
    return NextResponse.json(
      { error: `No ledger records found for claim_id: ${claim_id}` },
      { status: 404 }
    );
  }

  // Return newest first
  const sorted = [...matching].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return NextResponse.json({
    claim_id,
    total: sorted.length,
    records: sorted,
  });
}

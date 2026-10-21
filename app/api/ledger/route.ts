import { NextRequest, NextResponse } from 'next/server';
import { requireOperator } from '@/lib/internal-auth';
import {
  getLedgerRecords,
  getLedgerRecordById,
  addAuthorResponseToRecord,
  verifyLedgerChain,
} from '@/lib/ledger';

export async function GET(req: NextRequest) {
  const guard = await requireOperator(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const verify = url.searchParams.get('verify');
  const verdictId = url.searchParams.get('id');

  if (verify === 'true') {
    const verification = verifyLedgerChain();
    return NextResponse.json(verification);
  }

  if (verdictId) {
    const record = getLedgerRecordById(verdictId);
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    return NextResponse.json(record);
  }

  const records = getLedgerRecords();
  return NextResponse.json({
    total_blocks: records.length,
    ledger: records,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireOperator(req);
  if (guard) return guard;
  try {
    const body = await req.json();
    const { verdict_id, author_name, response_text, rebuttal_url, author_email } = body;

    if (!verdict_id || !author_name || !response_text) {
      return NextResponse.json(
        { error: 'verdict_id, author_name, and response_text are required' },
        { status: 400 }
      );
    }

    if (typeof author_name !== 'string' || author_name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Valid author_name of at least 2 characters is required' },
        { status: 400 }
      );
    }

    if (typeof response_text !== 'string' || response_text.trim().length < 10) {
      return NextResponse.json(
        { error: 'Detailed author response text (min 10 characters) is required' },
        { status: 400 }
      );
    }

    const response = addAuthorResponseToRecord(
      verdict_id,
      author_name,
      response_text,
      rebuttal_url
    );

    if (!response) {
      return NextResponse.json({ error: 'Verdict record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, response });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

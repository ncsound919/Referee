import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/internal-auth';
import { searchPubMed } from '@/lib/integrations/pubmed';

export async function POST(req: Request) {
  const guard = await requireOperator(req);
  if (guard) return guard;

  const { query } = await req.json();

  try {
    const results = await searchPubMed(query);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to search PubMed' }, { status: 500 });
  }
}

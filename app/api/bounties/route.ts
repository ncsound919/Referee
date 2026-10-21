import { NextResponse } from 'next/server';
import { COMMUNITY_BOUNTIES } from '@/lib/bounties';

export async function GET() {
  return NextResponse.json({
    total: COMMUNITY_BOUNTIES.length,
    bounties: COMMUNITY_BOUNTIES,
  });
}

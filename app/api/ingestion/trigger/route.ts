import { NextResponse } from 'next/server';

// Stubs for dataset/paper ingestion
export async function POST(req: Request) {
  const { source, query } = await req.json();

  console.log(`Ingesting from ${source} with query: ${query}`);

  // Stub logic: simulate discovery of a new claim
  return NextResponse.json({
    status: 'INGESTED',
    data: {
      claim_id: `claim_${Date.now()}`,
      title: `Ingested study: ${query}`,
      dataset_id: 'EXTERNAL_INGESTION',
    },
  });
}

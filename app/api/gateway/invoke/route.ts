import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/internal-auth';
// import { apiGatewayClient } from '@/lib/integrations/aws';
// import { InvokeCommand } from '@aws-sdk/client-api-gateway';

/**
 * POST /api/gateway/invoke
 *
 * Not implemented. This route used to answer `200 {"response": "API Gateway
 * invocation stubbed"}`, which told a caller that a gateway call had happened
 * when nothing was invoked. It now answers 501 so the gap is visible.
 */
export async function POST(req: Request) {
  const guard = await requireOperator(req);
  if (guard) return guard;

  return NextResponse.json(
    {
      error: 'not_implemented',
      detail:
        'API Gateway invocation is not wired up. The previous implementation returned a stubbed success response.',
    },
    { status: 501 }
  );
}

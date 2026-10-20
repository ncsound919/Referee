import { NextResponse } from 'next/server';
// import { apiGatewayClient } from '@/lib/integrations/aws';
// import { InvokeCommand } from '@aws-sdk/client-api-gateway';

export async function POST(req: Request) {
  const { action, payload } = await req.json();

  // const command = new InvokeCommand({
  //   restApiId: process.env.API_GATEWAY_ID,
  //   resourceId: process.env.API_GATEWAY_RESOURCE_ID,
  //   httpMethod: 'POST',
  //   pathWithQueryString: `/execute_skill?action=${action}`,
  //   body: JSON.stringify(payload),
  // });

  try {
    // const response = await apiGatewayClient.send(command);
    return NextResponse.json({ response: 'API Gateway invocation stubbed' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to invoke API Gateway' }, { status: 500 });
  }
}

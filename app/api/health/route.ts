import { NextResponse } from 'next/server';

/**
 * GET /api/health — unauthenticated liveness probe.
 *
 * Reports only whether the service is up and whether its dependencies are
 * configured. It deliberately exposes no internal URLs, versions, repo names
 * or action lists.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'referee-web',
    engine_configured: Boolean(process.env.REFEREE_CORE_URL),
    operator_configured: Boolean(
      process.env.INTERNAL_API_KEY || process.env.REFEREE_INTERNAL_KEY || process.env.REFEREE_API_KEY
    ),
  });
}

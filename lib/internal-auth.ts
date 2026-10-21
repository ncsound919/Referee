import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  SESSION_COOKIE,
  operatorSecret,
  readCookie,
  verifySessionToken,
} from './session';

/**
 * Authentication for the referee API.
 *
 * Two credential forms are accepted, both derived from one secret:
 *  - an API key in `x-api-key`, `x-referee-key` or `Authorization: Bearer`
 *    (used by service-to-service callers such as the Concordance website);
 *  - an operator session cookie (used by the browser dashboard).
 *
 * When no secret is configured the route runs open **only** outside a
 * production build. In production an unconfigured secret closes the route with
 * a 503: a service that silently opens when its secret is missing is
 * indistinguishable from one that is working correctly.
 */

/** The configured secret, or an empty string when none is set. */
export function configuredSecret(): string {
  return operatorSecret();
}

/** True when this build must not run any route without a configured secret. */
export function isProductionBuild(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Constant-time string comparison that does not leak length through timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still compare something of equal length so the early return does not
    // become a length oracle.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Extract an API key from the request headers, if present. */
export function headerKey(req: Request): string | undefined {
  return (
    req.headers.get('x-api-key') ||
    req.headers.get('x-referee-key') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim() ||
    undefined
  );
}

/**
 * Guard for machine-to-machine routes: the caller must present the API key.
 */
export function requireInternalKey(req: Request): NextResponse | null {
  const expected = configuredSecret();

  if (!expected) {
    if (isProductionBuild()) {
      return notConfigured();
    }
    return null;
  }

  const supplied = headerKey(req);
  if (!supplied || !safeEqual(supplied, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * Guard for routes the browser dashboard uses: an API key **or** a valid
 * operator session cookie.
 */
export async function requireOperator(req: Request): Promise<NextResponse | null> {
  const expected = configuredSecret();

  if (!expected) {
    if (isProductionBuild()) {
      return notConfigured();
    }
    return null;
  }

  const supplied = headerKey(req);
  if (supplied && safeEqual(supplied, expected)) return null;

  const token = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
  if (await verifySessionToken(token)) return null;

  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

function notConfigured(): NextResponse {
  return NextResponse.json(
    {
      error: 'service_not_configured',
      detail:
        'No operator secret is configured (INTERNAL_API_KEY / REFEREE_INTERNAL_KEY / REFEREE_API_KEY).',
    },
    { status: 503 }
  );
}

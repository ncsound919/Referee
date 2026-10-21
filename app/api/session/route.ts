import { NextResponse } from 'next/server';
import {
  configuredSecret,
  headerKey,
  isProductionBuild,
  safeEqual,
} from '@/lib/internal-auth';
import { SESSION_COOKIE, SESSION_TTL_MS, createSessionToken } from '@/lib/session';

/**
 * POST /api/session — exchange the operator key for a session cookie.
 *
 * The browser dashboard cannot present an API key on every request, so it
 * signs in once here. The key is never persisted client-side.
 */
export async function POST(req: Request) {
  const expected = configuredSecret();

  if (!expected) {
    if (isProductionBuild()) {
      return NextResponse.json(
        {
          error: 'service_not_configured',
          detail:
            'No operator secret is configured (INTERNAL_API_KEY / REFEREE_INTERNAL_KEY / REFEREE_API_KEY).',
        },
        { status: 503 }
      );
    }
    // Development with no secret configured: there is nothing to authenticate
    // against, so hand out a session anyway.
    const res = NextResponse.json({ ok: true, dev: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(), cookieOptions(req));
    return res;
  }

  let supplied = headerKey(req);
  if (!supplied) {
    try {
      const body = (await req.json()) as { key?: unknown };
      if (typeof body?.key === 'string') supplied = body.key;
    } catch {
      supplied = undefined;
    }
  }

  if (!supplied || !safeEqual(supplied, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), cookieOptions(req));
  return res;
}

/** DELETE /api/session — sign out. */
export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(req), maxAge: 0 });
  return res;
}

/**
 * Whether the session cookie should carry the `Secure` attribute.
 *
 * A `Secure` cookie is dropped by the browser when the page was served over
 * plain HTTP, which turns "sign in" into a silent no-op on a self-hosted
 * plain-HTTP deployment. The decision is therefore:
 *
 *  1. `REFEREE_COOKIE_SECURE` overrides everything when set;
 *  2. otherwise `X-Forwarded-Proto` decides, which is what a TLS-terminating
 *     load balancer (the ALB in `infra/terraform`) sets;
 *  3. otherwise the cookie is `Secure` in a production build.
 */
function cookieSecure(req: Request): boolean {
  const override = (process.env.REFEREE_COOKIE_SECURE ?? '').toLowerCase();
  if (override === '0' || override === 'false') return false;
  if (override === '1' || override === 'true') return true;

  const forwarded = req.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim().toLowerCase() === 'https';

  return process.env.NODE_ENV === 'production';
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cookieSecure(req),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

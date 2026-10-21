import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, readCookie, verifySessionToken } from '@/lib/session';

/**
 * Page authentication.
 *
 * The referee dashboard is an operator tool: it reads the evidence ledger,
 * runs adjudications and starts autonomous jobs. The API routes enforce their
 * own credentials (`requireOperator` in `lib/internal-auth.ts`); this
 * middleware only decides whether a *page* may be rendered.
 *
 * API requests are deliberately not redirected here. They get a 401 JSON body
 * from the route handler, which is the right answer for a machine client.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

function isPublicPath(pathname: string): boolean {
  if (
    pathname === '/login' ||
    pathname === '/api/session' ||
    pathname === '/api/health' ||
    pathname === '/favicon.ico'
  ) {
    return true;
  }
  // Next.js build output and static assets.
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.includes('.')
  );
}

export const config = {
  // API routes are excluded: they enforce their own credentials and must
  // answer a machine client with 401 JSON, not an HTML redirect.
  matcher: ['/((?!api|_next/static|_next/image).*)'],
};

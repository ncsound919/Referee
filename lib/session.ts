/**
 * Operator sessions.
 *
 * The Next.js referee app has a browser dashboard. Every API route is
 * authenticated, so the browser needs a way to present a credential that is
 * not a long-lived API key typed into every request. This module mints a
 * short-lived, HMAC-signed session cookie from the same secret that guards the
 * API, so there is exactly one credential in the system.
 *
 * Only Web Crypto is used, so the same code runs in the Node runtime (route
 * handlers) and in the Edge runtime (middleware).
 */

export const SESSION_COOKIE = 'referee_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const encoder = new TextEncoder();

/**
 * The secret that authorises the operator console.
 *
 * Deliberately **not** `REFEREE_API_KEY`: that key is also held by the
 * Concordance website, which uses it to call the deterministic engine. If it
 * unlocked the console as well, a compromise of the website would be a
 * compromise of the referee's evidence ledger. The engine key is presented
 * separately, by `lib/integrations/referee-core-client.ts`.
 *
 * Returns an empty string when nothing is configured, which callers must
 * treat as "no credential exists" rather than "any credential is valid".
 */
export function operatorSecret(): string {
  return process.env.INTERNAL_API_KEY || process.env.REFEREE_INTERNAL_KEY || '';
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Mint a session token for `now`. */
export async function createSessionToken(now: number = Date.now()): Promise<string> {
  const secret = operatorSecret();
  if (!secret) throw new Error('No operator secret is configured.');
  const payload = String(now);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Verify a session token's signature and age. */
export async function verifySessionToken(
  token: string | undefined | null,
  now: number = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const secret = operatorSecret();
  if (!secret) return false;

  const separator = token.indexOf('.');
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = fromBase64Url(signature);
  } catch {
    return false;
  }

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      signatureBytes as unknown as BufferSource,
      encoder.encode(payload)
    );
  } catch {
    return false;
  }
  if (!valid) return false;

  const issued = Number(payload);
  if (!Number.isFinite(issued)) return false;
  const age = now - issued;
  return age >= 0 && age <= SESSION_TTL_MS;
}

/** Read a cookie value out of a raw `Cookie` header. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

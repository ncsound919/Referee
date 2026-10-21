/**
 * SHA-256 helpers.
 *
 * Uses Node's crypto module when available (server/Node runtimes) and the
 * Web Crypto API otherwise (browser/edge). The previous hand-rolled pure-JS
 * fallback (`pureSha256`) has been removed: it was mathematically incorrect
 * (bitwise OR where mod-2^32 addition was required) and produced wrong digests.
 * If a pure-JS path is ever required, add `@noble/hashes` rather than
 * re-implementing SHA-256.
 */
export function syncHash(message: string): string {
  try {
    const nodeCrypto = typeof require !== 'undefined' ? require('crypto') : null;
    if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
      return nodeCrypto.createHash('sha256').update(message, 'utf8').digest('hex');
    }
  } catch {
    // Non-node runtime
  }
  throw new Error('syncHash requires Node crypto; use the async sha256() in browser/edge runtimes.');
}

export async function sha256(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fall back to Node crypto in non-browser runtimes.
  try {
    const nodeCrypto = require('crypto');
    return nodeCrypto.createHash('sha256').update(message, 'utf8').digest('hex');
  } catch {
    throw new Error('sha256 requires Web Crypto or Node crypto.');
  }
}

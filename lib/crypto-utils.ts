/**
 * Cryptographically sound SHA-256 implementation.
 * Uses native node:crypto when available, with a compliant pure-TypeScript
 * FIPS 180-4 SHA-256 implementation fallback for universal browser/edge execution.
 */

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

export function pureSha256(ascii: string): string {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i = 0;
  let j = 0;

  const result: string[] = [];
  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  // Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes 2..19):
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  // Round constants (first 32 bits of fractional parts of cube roots of first 64 primes 2..311):
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Convert string to UTF-8 bytes in 32-bit big-endian words
  const utf8Bytes: number[] = [];
  for (i = 0; i < ascii[lengthProperty]; i++) {
    let charcode = ascii.charCodeAt(i);
    if (charcode < 0x80) {
      utf8Bytes.push(charcode);
    } else if (charcode < 0x800) {
      utf8Bytes.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8Bytes.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (ascii.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }

  const bitLength = utf8Bytes.length * 8;
  utf8Bytes.push(0x80);
  while ((utf8Bytes.length % 64) !== 56) {
    utf8Bytes.push(0);
  }

  for (i = 0; i < utf8Bytes.length; i += 4) {
    words.push(
      (utf8Bytes[i] << 24) |
      (utf8Bytes[i + 1] << 16) |
      (utf8Bytes[i + 2] << 8) |
      utf8Bytes[i + 3]
    );
  }

  // Append length in bits as 64-bit big-endian integer
  words.push(Math.floor(bitLength / maxWord));
  words.push(bitLength & 0xffffffff);

  // Process each 16-word (512-bit) block
  const w = new Array(64);
  for (i = 0; i < words[lengthProperty]; i += 16) {
    const a_h = [...hash];

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j];
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = ((w[j - 16] + gamma0) | 0 + (w[j - 7] + gamma1) | 0) | 0;
      }

      const s1 = rightRotate(a_h[4], 6) ^ rightRotate(a_h[4], 11) ^ rightRotate(a_h[4], 25);
      const ch = (a_h[4] & a_h[5]) ^ (~a_h[4] & a_h[6]);
      const temp1 = ((((a_h[7] + s1) | 0 + ch) | 0 + k[j]) | 0 + w[j]) | 0;
      const s0 = rightRotate(a_h[0], 2) ^ rightRotate(a_h[0], 13) ^ rightRotate(a_h[0], 22);
      const maj = (a_h[0] & a_h[1]) ^ (a_h[0] & a_h[2]) ^ (a_h[1] & a_h[2]);
      const temp2 = (s0 + maj) | 0;

      a_h[7] = a_h[6];
      a_h[6] = a_h[5];
      a_h[5] = a_h[4];
      a_h[4] = (a_h[3] + temp1) | 0;
      a_h[3] = a_h[2];
      a_h[2] = a_h[1];
      a_h[1] = a_h[0];
      a_h[0] = (temp1 + temp2) | 0;
    }

    for (j = 0; j < 8; j++) {
      hash[j] = (hash[j] + a_h[j]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    result.push((hash[i] >>> 0).toString(16).padStart(8, '0'));
  }
  return result.join('');
}

export function syncHash(message: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = typeof require !== 'undefined' ? require('crypto') : null;
    if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
      return nodeCrypto.createHash('sha256').update(message, 'utf8').digest('hex');
    }
  } catch {
    // Non-node runtime
  }
  return pureSha256(message);
}

export async function sha256(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return syncHash(message);
}

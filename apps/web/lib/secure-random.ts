/**
 * Isomorphic cryptographically-secure random utilities.
 *
 * Single code path that uses the Web Crypto API (`globalThis.crypto.getRandomValues`),
 * available on Node ≥ 19 and all modern browsers. Throws
 * `SecureRandomUnavailableError` instead of silently falling back to `Math.random`.
 *
 * WEB-13 (audit 2026-05-19): introduced to replace ad-hoc `Math.random` token /
 * filename generation across `features/chat/**` and `app/api/**`. The ESLint
 * rule in `eslint.config.mjs` forbids `Math.random` in those paths and points
 * callers here.
 */

export class SecureRandomUnavailableError extends Error {
  constructor() {
    super('Cryptographically secure RNG is not available in this runtime');
    this.name = 'SecureRandomUnavailableError';
  }
}

function getRandomBytes(byteLength: number): Uint8Array {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new RangeError('byteLength must be a positive integer');
  }
  if (byteLength > 65_536) {
    throw new RangeError('byteLength must be ≤ 65536 (Web Crypto API limit)');
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new SecureRandomUnavailableError();
  }
  const out = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(out);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('hex');
  }
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Generate a base64url-encoded cryptographically-random token.
 * @param byteLength entropy in bytes; default 18 → 24-char token. 24 bytes → 32 chars.
 */
export function secureToken(byteLength = 18): string {
  return toBase64Url(getRandomBytes(byteLength));
}

/**
 * Generate a hex-encoded cryptographically-random token.
 * @param byteLength entropy in bytes; default 16 → 32-char hex.
 */
export function secureTokenHex(byteLength = 16): string {
  return toHex(getRandomBytes(byteLength));
}

const FILENAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a filesystem-safe `[a-z0-9]` segment using rejection sampling
 * (no modulo bias).
 * @param length output length; default 13.
 */
export function secureFilenameSegment(length = 13): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError('length must be a positive integer');
  }
  const out: string[] = new Array(length);
  let filled = 0;
  const limit = 256 - (256 % FILENAME_ALPHABET.length);
  while (filled < length) {
    const batch = getRandomBytes(Math.max(length, 16));
    for (let i = 0; i < batch.length && filled < length; i++) {
      const byte = batch[i]!;
      if (byte >= limit) continue;
      out[filled++] = FILENAME_ALPHABET[byte % FILENAME_ALPHABET.length]!;
    }
  }
  return out.join('');
}

export function secureRandomFloat(): number {
  const bytes = getRandomBytes(4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, false) / 0x1_0000_0000;
}

export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError('maxExclusive must be a positive integer');
  }
  if (maxExclusive === 1) return 0;
  const max32 = 0x1_0000_0000;
  const limit = Math.floor(max32 / maxExclusive) * maxExclusive;
  for (;;) {
    const bytes = getRandomBytes(4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const value = view.getUint32(0, false);
    if (value < limit) return value % maxExclusive;
  }
}

export function isSecureRandomAvailable(): boolean {
  return typeof globalThis.crypto?.getRandomValues === 'function';
}

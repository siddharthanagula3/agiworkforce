/**
 * Crypto Utilities
 *
 * Shared cryptographic utility functions for hashing, token generation,
 * and basic data integrity operations. Uses Web Crypto API for
 * cross-platform compatibility (browser, Node.js, Deno).
 *
 * NOTE: For sensitive operations (API key encryption, password hashing),
 * use the Rust backend's SecretManager (Argon2id + AES-GCM). These
 * utilities are for non-sensitive operations like content hashing,
 * nonce generation, and identifier creation.
 *
 * @module crypto
 * @packageDocumentation
 */

/**
 * Generate a cryptographically secure random token string.
 *
 * Uses `crypto.getRandomValues` for secure randomness, encoded as
 * URL-safe base64 (no padding).
 *
 * @param byteLength - Number of random bytes (default: 32, yielding ~43 chars)
 * @returns URL-safe base64 token string
 *
 * @example
 * ```typescript
 * const token = generateToken();      // "dG9rZW4tYWJjLTEyMy1leGFtcGxl..."
 * const short = generateToken(16);    // Shorter token (~22 chars)
 * ```
 */
export function generateToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  // Convert to URL-safe base64 without padding
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a random UUID v4.
 *
 * Uses `crypto.randomUUID()` when available, falls back to manual generation.
 *
 * @returns UUID v4 string (e.g., `"550e8400-e29b-41d4-a716-446655440000"`)
 *
 * @example
 * ```typescript
 * const id = generateUUID(); // "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
 * ```
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version (4) and variant (10) bits per RFC 4122
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Compute a SHA-256 hash of a string.
 *
 * Returns the hash as a lowercase hexadecimal string.
 *
 * @param input - String to hash
 * @returns Hex-encoded SHA-256 hash
 *
 * @example
 * ```typescript
 * const hash = await sha256('hello world');
 * // "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
 * ```
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute a SHA-1 hash of a string.
 *
 * Returns the hash as a lowercase hexadecimal string.
 * NOTE: SHA-1 is cryptographically broken for collision resistance.
 * Use only for non-security purposes (content addressing, checksums).
 *
 * @param input - String to hash
 * @returns Hex-encoded SHA-1 hash
 *
 * @example
 * ```typescript
 * const hash = await sha1('hello world');
 * // "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed"
 * ```
 */
export async function sha1(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random numeric code of a given length.
 *
 * Useful for pairing codes, OTP codes, and verification codes.
 *
 * @param length - Number of digits (default: 6)
 * @returns Numeric string of the specified length
 *
 * @example
 * ```typescript
 * const code = generateNumericCode();    // "847293"
 * const pin = generateNumericCode(4);    // "3847"
 * ```
 */
export function generateNumericCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 10).toString()).join('');
}

/**
 * Generate a short alphanumeric identifier.
 *
 * Useful for short IDs, share links, and display codes.
 * Uses a URL-safe alphabet (a-z, A-Z, 0-9).
 *
 * @param length - Character length (default: 8)
 * @returns Alphanumeric string of the specified length
 *
 * @example
 * ```typescript
 * const id = generateShortId();      // "aB3kL9mX"
 * const long = generateShortId(12);  // "aB3kL9mXp2Qr"
 * ```
 */
export function generateShortId(length = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Compute an HMAC-SHA256 signature.
 *
 * @param key - Secret key string
 * @param message - Message to sign
 * @returns Hex-encoded HMAC-SHA256 signature
 *
 * @example
 * ```typescript
 * const signature = await hmacSha256('my-secret-key', 'message-to-sign');
 * ```
 */
export async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Whether the strings are equal
 *
 * @example
 * ```typescript
 * const isValid = timingSafeEqual(receivedToken, expectedToken);
 * ```
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

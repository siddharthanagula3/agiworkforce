/**
 * Crypto Utilities
 *
 * Content hashing and constant-time string comparison over the Web Crypto API.
 * Secret storage and password hashing belong to the Rust SecretManager.
 *
 * @module crypto
 * @packageDocumentation
 */

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

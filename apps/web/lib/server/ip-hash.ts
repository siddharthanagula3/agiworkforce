import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { logger } from '@/lib/logger';

const MINIMUM_PEPPER_LENGTH = 32;
const DERIVED_KEY_LABEL = 'ip-hash-pepper/v1';

let ephemeralKey: Buffer | null = null;
const reported = new Set<string>();

function reportOnce(reason: string, level: 'warn' | 'error', message: string): void {
  if (reported.has(reason)) return;
  reported.add(reason);
  logger[level]({}, message);
}

/**
 * Resolves the HMAC key, in descending order of operator intent. It never
 * throws and never falls back to a constant: an address hashed under a key
 * that ships in this repository is recoverable by exhausting the ~4.3e9 IPv4
 * space, so a key nobody outside the process holds, even a throwaway one that
 * costs cross-instance correlation, is strictly safer than a known one, and
 * safer than a throw that would silently drop the caller's write.
 */
function ipHashKey(): Buffer {
  const pepper = process.env['IP_HASH_PEPPER']?.trim() ?? '';
  if (pepper.length >= MINIMUM_PEPPER_LENGTH) return Buffer.from(pepper, 'utf8');

  if (pepper.length > 0) {
    reportOnce(
      'short-pepper',
      'error',
      `IP_HASH_PEPPER is shorter than ${MINIMUM_PEPPER_LENGTH} characters and is being ignored. ` +
        'A guessable key lets anyone holding the stored digests rebuild the addresses they came ' +
        'from. Set a random value of at least 32 characters.',
    );
  }

  const logSalt = process.env['LOG_SALT']?.trim() ?? '';
  if (logSalt.length > 0) {
    reportOnce(
      'derived-from-log-salt',
      'warn',
      'IP_HASH_PEPPER is not set; deriving the IP pseudonymization key from LOG_SALT. Set ' +
        'IP_HASH_PEPPER to give address hashing a dedicated key that rotates independently.',
    );
    return createHmac('sha256', logSalt).update(DERIVED_KEY_LABEL).digest();
  }

  ephemeralKey ??= randomBytes(32);
  reportOnce(
    'ephemeral-key',
    'error',
    'Neither IP_HASH_PEPPER nor LOG_SALT is set; IP pseudonymization fell back to a per-process ' +
      'key. Digests stay unrecoverable, but they will not correlate across restarts or instances, ' +
      'so unique-visitor counts overcount. Set IP_HASH_PEPPER.',
  );
  return ephemeralKey;
}

/**
 * @param ipAddress the client address; it is never returned and never stored
 * @param domain    separates namespaces so the same address in two surfaces
 *                  does not produce the same digest
 */
export function hashIpAddress(ipAddress: string, domain: string): string {
  return createHmac('sha256', ipHashKey()).update(`${domain}\0${ipAddress}`).digest('hex');
}

/** Test seam. Not exported from any barrel; do not call from product code. */
export function __resetIpHashKeyForTests(): void {
  ephemeralKey = null;
  reported.clear();
}

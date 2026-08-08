import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { logger } from '@/lib/logger';

/**
 * Stable, non-reversible reference for an identifier we must correlate but
 * must not store.
 *
 * WHY THIS EXISTS. Four routes hand-rolled the same construction —
 *
 *   createHash('sha256').update(id + (process.env['LOG_SALT'] ?? '')).digest('hex')
 *
 * — in `auth/device/token`, `auth/device/approve`, `auth/device/code` and
 * `user/delete-account`. Two problems, neither of which the CodeQL
 * `js/insufficient-password-hash` alert actually names:
 *
 * 1. `?? ''` degrades to an UNSALTED hash of an enumerable identifier when
 *    `LOG_SALT` is unset, and `LOG_SALT` is only a warning in
 *    `lib/validate-env.ts`, not a critical variable. A production deployment
 *    that never set it emits `sha256(userId)` — reversible in seconds by
 *    anyone holding the user list, which is precisely the population the
 *    pseudonym is supposed to protect against. It fails silently, and it fails
 *    open.
 * 2. Salt-by-concatenation is the weaker construction. HMAC is the standard
 *    primitive for keyed pseudonymization and is not length-extendable.
 *
 * WHAT THIS DOES INSTEAD. HMAC-SHA256 keyed by `LOG_SALT`. When `LOG_SALT` is
 * absent the key falls back to 32 random bytes generated once per process,
 * and the absence is logged as an error. That choice is deliberate: the
 * privacy property (a pseudonym must never be reversible) is preserved
 * unconditionally, and the only thing that degrades is correlation across
 * restarts and instances — visible, bounded, and far less costly than the
 * present failure mode of quietly emitting a reversible digest.
 *
 * The key is read once. Rotating `LOG_SALT` changes every pseudonym it
 * produces, which is the intended behaviour: old references stop correlating
 * with new ones, and no historical identifier becomes recoverable.
 */
let cachedKey: Buffer | null = null;

function pseudonymizationKey(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = process.env['LOG_SALT'];
  if (configured) {
    cachedKey = Buffer.from(configured, 'utf8');
    return cachedKey;
  }

  cachedKey = randomBytes(32);
  logger.error(
    {},
    'LOG_SALT is not set; pseudonymized references fall back to a per-process key and will not ' +
      'correlate across restarts or instances. Set LOG_SALT to restore stable correlation.',
  );
  return cachedKey;
}

/**
 * @param value      the identifier to pseudonymize (user id, device id, …)
 * @param domain     separates namespaces so the same id in two contexts does
 *                   not produce the same reference
 * @param lengthHex  hex characters to keep; 16 (64 bits) is ample for a
 *                   correlation handle and matches the previous call sites
 */
export function pseudonymizeIdentifier(value: string, domain: string, lengthHex = 16): string {
  return createHmac('sha256', pseudonymizationKey())
    .update(`${domain}\0${value}`)
    .digest('hex')
    .slice(0, lengthHex);
}

/** Test seam. Not exported from any barrel; do not call from product code. */
export function __resetPseudonymizationKeyForTests(): void {
  cachedKey = null;
}

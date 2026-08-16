import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

import { logger } from '@/lib/logger';

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

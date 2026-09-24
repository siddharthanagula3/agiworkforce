import 'server-only';

import {
  fingerprintManagedUsageRequest,
  parseManagedUsageIdempotencyKey,
} from '@/lib/services/managed-usage-request-service';

/**
 * Keeps the derived key inside the ledger's 8-128 character bound however long
 * the namespace and the identity are.
 */
const IDENTITY_DIGEST_CHARS = 48;

export interface ManagedUsageIdentity {
  /** What the work is, so two surfaces cannot collide on one client key. */
  namespace: string;
  /** A client supplied `Idempotency-Key`, which outranks the derived identity. */
  suppliedKey?: string | null;
  /** What identifies one unit of this work when the client names none. */
  identity: unknown;
}

/**
 * The idempotency key for a managed usage reservation, derived from the request
 * rather than minted fresh.
 *
 * The ledger deduplicates a hold by this key: a retry, a redelivery or a resumed
 * durable step that reaches the same key is refused rather than charged again,
 * and a key that arrives with a different request hash is a conflict rather than
 * a silent reuse. Both properties need the key to be a function of the work, so
 * nothing here may read a clock or a random source.
 */
export function managedUsageIdempotencyKey(input: ManagedUsageIdentity): string {
  const supplied = typeof input.suppliedKey === 'string' ? input.suppliedKey.trim() : '';
  const digest = fingerprintManagedUsageRequest(
    supplied ? { suppliedKey: parseManagedUsageIdempotencyKey(supplied) } : input.identity,
  ).slice(0, IDENTITY_DIGEST_CHARS);
  return `${input.namespace}.${digest}`;
}

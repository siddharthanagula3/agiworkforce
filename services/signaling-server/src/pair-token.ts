import { createHmac, timingSafeEqual } from 'node:crypto';

export type PairTokenRole = 'desktop' | 'mobile';

export interface PairTokenClaims {
  code: string;
  role: PairTokenRole;
  createdAt: number;
  accountId: string;
}

// Length-prefixed so no field can be moved into its neighbour: an account id is
// opaque to this server and may contain the separator.
function signedPayload(claims: PairTokenClaims): string {
  return [claims.code, claims.role, String(claims.createdAt), claims.accountId]
    .map((field) => `${field.length}:${field}`)
    .join('|');
}

// The token binds to createdAt, never to expiresAt. A paired session's expiry is
// extended to 24h once both peers connect, so signing over it invalidated the
// token the client already holds and every reconnect failed verification.
export function issuePairToken(secret: string, claims: PairTokenClaims): string {
  return createHmac('sha256', secret).update(signedPayload(claims)).digest('hex');
}

// The account a pairing belongs to. Written by the authenticated caller that
// created the session and never by a client, so it is the only account any
// token for that session may be issued to or verified against.
export function pairingAccountId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const userId = metadata?.['userId'];
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
}

export type PairTokenClaimDecision =
  | { ok: true; accountId: string }
  | { ok: false; reason: 'pairing_has_no_account' | 'pairing_belongs_to_another_account' };

// A pairing code is not a credential. Whoever redeems one names the account it
// has authenticated, and only the account the pairing was created for may hold
// a token for it.
export function authorizePairTokenClaim(
  metadata: Record<string, unknown> | null | undefined,
  claimedAccountId: string,
): PairTokenClaimDecision {
  const accountId = pairingAccountId(metadata);
  if (!accountId) return { ok: false, reason: 'pairing_has_no_account' };
  if (!claimedAccountId || claimedAccountId !== accountId) {
    return { ok: false, reason: 'pairing_belongs_to_another_account' };
  }
  return { ok: true, accountId };
}

export function verifyPairToken(
  secret: string,
  presented: string | undefined,
  claims: PairTokenClaims,
): boolean {
  if (!presented) return false;
  if (!claims.accountId) return false;
  let presentedBuf: Buffer;
  try {
    presentedBuf = Buffer.from(presented, 'hex');
  } catch {
    return false;
  }
  const expected = Buffer.from(issuePairToken(secret, claims), 'hex');
  if (presentedBuf.length !== expected.length) return false;
  return timingSafeEqual(presentedBuf, expected);
}

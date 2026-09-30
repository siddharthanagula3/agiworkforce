import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export type PairTokenRole = 'desktop' | 'mobile';

export interface PairTokenClaims {
  code: string;
  role: PairTokenRole;
  createdAt: number;
  accountId: string;
  deviceId: string;
  generation: string;
}

export interface PairCredential {
  deviceId: string;
  generation: string;
}

const credentialSchema = z
  .object({
    deviceId: z.guid(),
    generation: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const CREDENTIAL_KEYS: Readonly<Record<PairTokenRole, string>> = Object.freeze({
  desktop: 'desktopPairCredential',
  mobile: 'mobilePairCredential',
});

export function pairCredentialKey(role: PairTokenRole): string {
  return CREDENTIAL_KEYS[role];
}

export function pairCredential(
  metadata: Record<string, unknown> | null | undefined,
  role: PairTokenRole,
): PairCredential | null {
  const parsed = credentialSchema.safeParse(metadata?.[pairCredentialKey(role)]);
  return parsed.success ? parsed.data : null;
}

export function freshPairCredential(deviceId: string | null): PairCredential {
  return { deviceId: deviceId ?? randomUUID(), generation: randomBytes(32).toString('hex') };
}

export function withPairCredential(
  metadata: Record<string, unknown> | null | undefined,
  role: PairTokenRole,
  credential: PairCredential,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [pairCredentialKey(role)]: credential };
}

// Length-prefixed so no field can be moved into its neighbour: an account id is
// opaque to this server and may contain the separator.
function signedPayload(claims: PairTokenClaims): string {
  return [
    claims.code,
    claims.role,
    String(claims.createdAt),
    claims.accountId,
    claims.deviceId,
    claims.generation,
  ]
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
  if (!presented || !/^[a-f0-9]{64}$/.test(presented)) return false;
  if (!claims.accountId) return false;
  if (
    !credentialSchema.safeParse({ deviceId: claims.deviceId, generation: claims.generation })
      .success
  )
    return false;
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

import { createHmac, timingSafeEqual } from 'node:crypto';

export type PairTokenRole = 'desktop' | 'mobile';

// The token binds to createdAt, never to expiresAt. A paired session's expiry is
// extended to 24h once both peers connect, so signing over it invalidated the
// token the client already holds and every reconnect failed verification.
export function issuePairToken(
  secret: string,
  code: string,
  role: PairTokenRole,
  createdAt: number,
): string {
  return createHmac('sha256', secret).update(`${code}|${role}|${createdAt}`).digest('hex');
}

export function verifyPairToken(
  secret: string,
  presented: string | undefined,
  code: string,
  role: PairTokenRole,
  createdAt: number,
): boolean {
  if (!presented) return false;
  let presentedBuf: Buffer;
  try {
    presentedBuf = Buffer.from(presented, 'hex');
  } catch {
    return false;
  }
  const expected = Buffer.from(issuePairToken(secret, code, role, createdAt), 'hex');
  if (presentedBuf.length !== expected.length) return false;
  return timingSafeEqual(presentedBuf, expected);
}

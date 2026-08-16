import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Resolver } from 'node:dns/promises';

export const DOMAIN_VERIFICATION_RECORD_PREFIX = '_agiworkforce-sso';

export const DOMAIN_VERIFICATION_VALUE_PREFIX = 'agiworkforce-sso-verification=';

export const DOMAIN_VERIFICATION_CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CHALLENGE_TOKEN_VERSION = '01';
const CHALLENGE_EXPIRY_HEX_LENGTH = 8;
const CHALLENGE_ENTROPY_BYTES = 24;
const CHALLENGE_TOKEN_LENGTH =
  CHALLENGE_TOKEN_VERSION.length + CHALLENGE_EXPIRY_HEX_LENGTH + CHALLENGE_ENTROPY_BYTES * 2;

export function issueDomainVerificationToken(now: number = Date.now()): string {
  const expiresAtSeconds = Math.floor((now + DOMAIN_VERIFICATION_CHALLENGE_TTL_MS) / 1000);
  const expiryHex = expiresAtSeconds.toString(16).padStart(CHALLENGE_EXPIRY_HEX_LENGTH, '0');
  return `${CHALLENGE_TOKEN_VERSION}${expiryHex}${randomBytes(CHALLENGE_ENTROPY_BYTES).toString('hex')}`;
}

export function domainChallengeExpiresAt(token: string): Date | null {
  if (token.length !== CHALLENGE_TOKEN_LENGTH) return null;
  if (!token.startsWith(CHALLENGE_TOKEN_VERSION)) return null;

  const expiryHex = token.slice(
    CHALLENGE_TOKEN_VERSION.length,
    CHALLENGE_TOKEN_VERSION.length + CHALLENGE_EXPIRY_HEX_LENGTH,
  );
  if (!/^[0-9a-f]+$/.test(expiryHex)) return null;

  return new Date(Number.parseInt(expiryHex, 16) * 1000);
}

export function isDomainChallengeExpired(token: string, now: number = Date.now()): boolean {
  const expiresAt = domainChallengeExpiresAt(token);
  if (expiresAt === null) return true;
  return expiresAt.getTime() <= now;
}

export function domainVerificationRecordName(domain: string): string {
  return `${DOMAIN_VERIFICATION_RECORD_PREFIX}.${domain}`;
}

export function domainVerificationRecordValue(token: string): string {
  return `${DOMAIN_VERIFICATION_VALUE_PREFIX}${token}`;
}

export interface DomainVerificationInstructions {
  recordType: 'TXT';
  recordName: string;
  recordValue: string;
}

export function domainVerificationInstructions(
  domain: string,
  token: string,
): DomainVerificationInstructions {
  return {
    recordType: 'TXT',
    recordName: domainVerificationRecordName(domain),
    recordValue: domainVerificationRecordValue(token),
  };
}

export type DomainVerificationOutcome =
  | { verified: true }
  | {
      verified: false;
      reason: 'no_record' | 'token_mismatch' | 'lookup_failed' | 'challenge_expired';
    };

export interface TxtResolver {
  resolveTxt(hostname: string): Promise<string[][]>;
}

function tokensMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function verifyDomainOwnership(
  domain: string,
  expectedToken: string,
  resolver: TxtResolver = new Resolver(),
  now: number = Date.now(),
): Promise<DomainVerificationOutcome> {
  if (expectedToken.length === 0) {
    return { verified: false, reason: 'no_record' };
  }

  if (isDomainChallengeExpired(expectedToken, now)) {
    return { verified: false, reason: 'challenge_expired' };
  }

  let records: string[][];
  try {
    records = await resolver.resolveTxt(domainVerificationRecordName(domain));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { verified: false, reason: 'no_record' };
    }
    return { verified: false, reason: 'lookup_failed' };
  }

  if (records.length === 0) {
    return { verified: false, reason: 'no_record' };
  }

  const expectedValue = domainVerificationRecordValue(expectedToken);
  let sawCandidate = false;

  for (const chunks of records) {
    const value = chunks.join('').trim();
    if (!value.startsWith(DOMAIN_VERIFICATION_VALUE_PREFIX)) {
      continue;
    }
    sawCandidate = true;
    if (tokensMatch(expectedValue, value)) {
      return { verified: true };
    }
  }

  return { verified: false, reason: sawCandidate ? 'token_mismatch' : 'no_record' };
}

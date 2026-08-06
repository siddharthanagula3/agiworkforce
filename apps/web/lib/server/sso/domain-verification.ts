import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Resolver } from 'node:dns/promises';

/**
 * DNS TXT proof that the organization configuring an SSO connection controls
 * the email domain it is claiming.
 *
 * This is not a nicety. This deployment does not use Clerk Organizations, so
 * enterprise connections are created instance-level and route every sign-in
 * whose email domain matches. Without proof of ownership, any org owner could
 * claim a domain they do not control and capture its users' authentication.
 */

/** The TXT record name an admin must create, e.g. `_agiworkforce-sso.example.com`. */
export const DOMAIN_VERIFICATION_RECORD_PREFIX = '_agiworkforce-sso';

/** The value prefix, so unrelated TXT records at the same name are ignored. */
export const DOMAIN_VERIFICATION_VALUE_PREFIX = 'agiworkforce-sso-verification=';

export function issueDomainVerificationToken(): string {
  return randomBytes(24).toString('hex');
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
  | { verified: false; reason: 'no_record' | 'token_mismatch' | 'lookup_failed' };

export interface TxtResolver {
  resolveTxt(hostname: string): Promise<string[][]>;
}

/**
 * Constant-time compare so a caller cannot learn a token byte-by-byte by
 * timing repeated verification attempts against a domain they control.
 */
function tokensMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Look up the challenge record and decide whether ownership is proven.
 *
 * The resolver is injectable so the verification logic is testable without
 * network access; production passes a stock Node resolver.
 */
export async function verifyDomainOwnership(
  domain: string,
  expectedToken: string,
  resolver: TxtResolver = new Resolver(),
): Promise<DomainVerificationOutcome> {
  if (expectedToken.length === 0) {
    return { verified: false, reason: 'no_record' };
  }

  let records: string[][];
  try {
    records = await resolver.resolveTxt(domainVerificationRecordName(domain));
  } catch (error) {
    // ENOTFOUND / ENODATA mean the admin has not published the record yet,
    // which is an expected state during setup rather than an infrastructure
    // failure. Anything else is a genuine lookup problem and is reported as
    // such so an operator is not told "add the record" when DNS is broken.
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
    // A TXT record longer than 255 bytes arrives as multiple chunks that the
    // publisher intends to be concatenated.
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

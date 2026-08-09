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

/**
 * How long an issued challenge stays acceptable.
 *
 * An unbounded challenge is the dangerous shape. Any enterprise tenant may
 * create a draft claiming a domain it does not own — migration 0092 allows
 * that deliberately, so a squatter cannot block the rightful owner — and the
 * only thing between that draft and an authentication takeover of every user
 * on the domain is that the TXT record never appears. Without expiry that
 * tenant holds a live, publishable challenge forever, so a lapsed subdomain
 * delegation, a contractor's temporary DNS access, or a later divestiture
 * converts a years-old draft into an instant verification. Bounding the window
 * forces the claim to be re-requested by someone who still has the account.
 */
export const DOMAIN_VERIFICATION_CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The expiry is carried inside the token itself rather than in a column: the
 * token is the only free-form value in the challenge, and self-describing
 * tokens mean an existing row needs no backfill to become bounded.
 *
 * Layout: `01` + 8 hex digits of expiry (unix seconds) + 48 hex digits of
 * entropy = 58 hex characters, which satisfies the
 * `sso_connections_domain_verification_token_shape` check (`^[a-f0-9]{32,64}$`)
 * from migration 0083 unchanged.
 */
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

/**
 * The moment this challenge stops being accepted, or null when the token does
 * not carry one (a token issued before the expiring format existed).
 */
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

/**
 * A token that carries no expiry is treated as EXPIRED, not as unexpiring: the
 * unbounded challenge is the defect being closed, so the fail-closed reading is
 * the only safe one. The way out is self-service and costs one request —
 * `PUT /api/admin/sso/verify-domain` issues a fresh challenge in the current
 * format, and the settings panel exposes it as "Reissue challenge".
 */
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
  now: number = Date.now(),
): Promise<DomainVerificationOutcome> {
  if (expectedToken.length === 0) {
    return { verified: false, reason: 'no_record' };
  }

  // Before the lookup, not after: an expired challenge must fail even when the
  // matching record IS published, or the expiry is decoration.
  if (isDomainChallengeExpired(expectedToken, now)) {
    return { verified: false, reason: 'challenge_expired' };
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

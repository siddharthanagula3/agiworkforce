import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  authorizePairTokenClaim,
  issuePairToken,
  pairingAccountId,
  verifyPairToken,
  type PairTokenClaims,
} from '../src/pair-token.js';

const SECRET = 'test-pair-token-secret';
const CODE = 'ABCD1234EFGH';
const CREATED_AT = 1_756_000_000_000;
const SHORT_EXPIRY = CREATED_AT + 300_000;
const LONG_EXPIRY = CREATED_AT + 24 * 60 * 60 * 1000;
const ACCOUNT_A = '3f1c9d2e-0000-4000-8000-00000000000a';
const ACCOUNT_B = '3f1c9d2e-0000-4000-8000-00000000000b';

function claims(overrides: Partial<PairTokenClaims> = {}): PairTokenClaims {
  return {
    code: CODE,
    role: 'mobile',
    createdAt: CREATED_AT,
    accountId: ACCOUNT_A,
    ...overrides,
  };
}

describe('pair token', () => {
  it('verifies the token it issued', () => {
    const token = issuePairToken(SECRET, claims());
    expect(verifyPairToken(SECRET, token, claims())).toBe(true);
  });

  // The session's expiry moves from 5 minutes to 24 hours the moment both peers
  // connect. A token signed over expiry stopped verifying at that instant, so
  // every reconnect after a successful pair was rejected as pairing_not_found.
  // with no restart involved.
  it('survives the expiry extension that happens when both peers connect', () => {
    const token = issuePairToken(SECRET, claims({ role: 'desktop' }));
    expect(verifyPairToken(SECRET, token, claims({ role: 'desktop' }))).toBe(true);

    const signedOverShortExpiry = issuePairToken(
      SECRET,
      claims({ role: 'desktop', createdAt: SHORT_EXPIRY }),
    );
    expect(
      verifyPairToken(
        SECRET,
        signedOverShortExpiry,
        claims({ role: 'desktop', createdAt: LONG_EXPIRY }),
      ),
    ).toBe(false);
  });

  it('rejects a token minted for the other role', () => {
    const token = issuePairToken(SECRET, claims({ role: 'mobile' }));
    expect(verifyPairToken(SECRET, token, claims({ role: 'desktop' }))).toBe(false);
  });

  it('rejects a token minted for a different code', () => {
    const token = issuePairToken(SECRET, claims());
    expect(verifyPairToken(SECRET, token, claims({ code: 'ZZZZ9999YYYY' }))).toBe(false);
  });

  // A recycled code is a different session, so its token must not carry over.
  it('rejects a token from an earlier session that reused the code', () => {
    const token = issuePairToken(SECRET, claims());
    expect(verifyPairToken(SECRET, token, claims({ createdAt: CREATED_AT + 1 }))).toBe(false);
  });

  it('rejects a token minted under a different secret', () => {
    const token = issuePairToken('other-secret', claims());
    expect(verifyPairToken(SECRET, token, claims())).toBe(false);
  });

  it('rejects an absent or malformed token', () => {
    expect(verifyPairToken(SECRET, undefined, claims())).toBe(false);
    expect(verifyPairToken(SECRET, '', claims())).toBe(false);
    expect(verifyPairToken(SECRET, 'not-hex', claims())).toBe(false);
    expect(verifyPairToken(SECRET, 'ab'.repeat(16), claims())).toBe(false);
  });
});

describe('a pair token is good for one account', () => {
  // checklist.md:72717. Scanning a QR does not make the scanner the owner of the
  // pairing: a token minted for one account must be worthless on another's.
  it('rejects the token of one account when it is presented for another', () => {
    const token = issuePairToken(SECRET, claims({ accountId: ACCOUNT_A }));

    expect(verifyPairToken(SECRET, token, claims({ accountId: ACCOUNT_A }))).toBe(true);
    expect(verifyPairToken(SECRET, token, claims({ accountId: ACCOUNT_B }))).toBe(false);
  });

  it('holds for the desktop role as well as the mobile one', () => {
    const token = issuePairToken(SECRET, claims({ role: 'desktop', accountId: ACCOUNT_A }));
    expect(verifyPairToken(SECRET, token, claims({ role: 'desktop', accountId: ACCOUNT_B }))).toBe(
      false,
    );
  });

  it('never verifies a token against no account at all', () => {
    const token = issuePairToken(SECRET, claims());
    expect(verifyPairToken(SECRET, token, claims({ accountId: '' }))).toBe(false);
  });

  // Fields are length-prefixed before signing, so an account id that contains
  // the separator cannot be arranged to sign as a different set of claims.
  it('cannot have one field pushed into the next', () => {
    const shifted = issuePairToken(
      SECRET,
      claims({ code: 'ABCD1234EFG', accountId: `H|${ACCOUNT_A}` }),
    );
    expect(verifyPairToken(SECRET, shifted, claims({ accountId: ACCOUNT_A }))).toBe(false);
  });
});

describe('who a pairing belongs to', () => {
  it('reads the account the authenticated creator recorded', () => {
    expect(pairingAccountId({ userId: ACCOUNT_A, initiator: 'desktop' })).toBe(ACCOUNT_A);
  });

  it('reports no account rather than guessing one', () => {
    expect(pairingAccountId(null)).toBeNull();
    expect(pairingAccountId({})).toBeNull();
    expect(pairingAccountId({ userId: '' })).toBeNull();
    expect(pairingAccountId({ userId: 42 })).toBeNull();
  });

  it('lets the owning account claim its own pairing', () => {
    expect(authorizePairTokenClaim({ userId: ACCOUNT_A }, ACCOUNT_A)).toEqual({
      ok: true,
      accountId: ACCOUNT_A,
    });
  });

  it('refuses a claim from a second account that has the code', () => {
    expect(authorizePairTokenClaim({ userId: ACCOUNT_A }, ACCOUNT_B)).toEqual({
      ok: false,
      reason: 'pairing_belongs_to_another_account',
    });
  });

  it('refuses a claim on a session that names no account', () => {
    expect(authorizePairTokenClaim(null, ACCOUNT_A)).toEqual({
      ok: false,
      reason: 'pairing_has_no_account',
    });
    expect(authorizePairTokenClaim({ desktopId: null }, ACCOUNT_A)).toEqual({
      ok: false,
      reason: 'pairing_has_no_account',
    });
  });

  it('refuses a claim that names no account', () => {
    expect(authorizePairTokenClaim({ userId: ACCOUNT_A }, '')).toEqual({
      ok: false,
      reason: 'pairing_belongs_to_another_account',
    });
  });
});

// The relay boots a listener and a database pool on import, so the suite reads
// its source the way __tests__/client-ip.test.ts and websocket/origin-policy.test.ts
// already do. These pin the three sites the account binding has to hold at.
describe('the relay binds every token site to an account', () => {
  const source = readFileSync(
    resolve(fileURLToPath(new URL('../src/index.ts', import.meta.url))),
    'utf8',
  );

  it('mints no token without an account', () => {
    const mints = source.match(/issuePairToken\([^)]*\)/gs) ?? [];
    expect(mints.length).toBeGreaterThanOrEqual(3);
    for (const mint of mints) {
      if (mint.startsWith('issuePairToken(code: string')) continue;
      expect(mint).toMatch(/accountId|claim\.accountId/);
    }
  });

  it('refuses to create a pairing that names no account', () => {
    expect(source).toContain('const accountId = pairingAccountId(metadata);');
    expect(source).toMatch(/if \(!accountId\) \{[\s\S]{0,300}account_required/);
  });

  it('verifies the register frame against the session account', () => {
    expect(source).toMatch(/verifyPairToken\([\s\S]{0,200}pairingAccountId\(session\.metadata\)/);
  });

  it('will not mint a claim token for an unauthenticated caller', () => {
    const claimRoute = source.slice(source.indexOf("app.post('/pairings/:code/claim'"));
    const handler = claimRoute.slice(0, claimRoute.indexOf('\n});'));
    expect(handler).toContain('constantTimeCompare(token, SIGNALING_SECRET)');
    expect(handler).toContain('authorizePairTokenClaim(sessionData.metadata');
    expect(handler.indexOf('constantTimeCompare')).toBeLessThan(handler.indexOf('issuePairToken'));
  });
});

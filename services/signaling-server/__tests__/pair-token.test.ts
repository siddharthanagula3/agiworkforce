import { describe, expect, it } from 'vitest';

import { issuePairToken, verifyPairToken } from '../src/pair-token.js';

const SECRET = 'test-pair-token-secret';
const CODE = 'ABCD1234EFGH';
const CREATED_AT = 1_756_000_000_000;
const SHORT_EXPIRY = CREATED_AT + 300_000;
const LONG_EXPIRY = CREATED_AT + 24 * 60 * 60 * 1000;

describe('pair token', () => {
  it('verifies the token it issued', () => {
    const token = issuePairToken(SECRET, CODE, 'mobile', CREATED_AT);
    expect(verifyPairToken(SECRET, token, CODE, 'mobile', CREATED_AT)).toBe(true);
  });

  it('survives the expiry extension that happens when both peers connect', () => {
    const token = issuePairToken(SECRET, CODE, 'desktop', CREATED_AT);
    expect(verifyPairToken(SECRET, token, CODE, 'desktop', CREATED_AT)).toBe(true);

    const signedOverShortExpiry = issuePairToken(SECRET, CODE, 'desktop', SHORT_EXPIRY);
    expect(verifyPairToken(SECRET, signedOverShortExpiry, CODE, 'desktop', LONG_EXPIRY)).toBe(
      false,
    );
  });

  it('rejects a token minted for the other role', () => {
    const token = issuePairToken(SECRET, CODE, 'mobile', CREATED_AT);
    expect(verifyPairToken(SECRET, token, CODE, 'desktop', CREATED_AT)).toBe(false);
  });

  it('rejects a token minted for a different code', () => {
    const token = issuePairToken(SECRET, CODE, 'mobile', CREATED_AT);
    expect(verifyPairToken(SECRET, token, 'ZZZZ9999YYYY', 'mobile', CREATED_AT)).toBe(false);
  });

  // A recycled code is a different session, so its token must not carry over.
  it('rejects a token from an earlier session that reused the code', () => {
    const token = issuePairToken(SECRET, CODE, 'mobile', CREATED_AT);
    expect(verifyPairToken(SECRET, token, CODE, 'mobile', CREATED_AT + 1)).toBe(false);
  });

  it('rejects a token minted under a different secret', () => {
    const token = issuePairToken('other-secret', CODE, 'mobile', CREATED_AT);
    expect(verifyPairToken(SECRET, token, CODE, 'mobile', CREATED_AT)).toBe(false);
  });

  it('rejects an absent or malformed token', () => {
    expect(verifyPairToken(SECRET, undefined, CODE, 'mobile', CREATED_AT)).toBe(false);
    expect(verifyPairToken(SECRET, '', CODE, 'mobile', CREATED_AT)).toBe(false);
    expect(verifyPairToken(SECRET, 'not-hex', CODE, 'mobile', CREATED_AT)).toBe(false);
    expect(verifyPairToken(SECRET, 'ab'.repeat(16), CODE, 'mobile', CREATED_AT)).toBe(false);
  });
});

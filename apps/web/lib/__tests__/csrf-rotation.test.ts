import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

import { generateCsrfToken, verifyCsrfToken, resetCsrfCache } from '../csrf';

/**
 * WEB-33 / SEV-WEB-07 regression. Verifies the CSRF_SECRET_PREV rotation
 * window works as designed:
 *   - Tokens signed with the current secret verify when only CSRF_SECRET is set
 *   - Tokens signed with the previous secret verify ONLY when CSRF_SECRET_PREV
 *     is also set
 *   - When CSRF_SECRET_PREV is removed, old tokens are immediately rejected
 *   - The minimum-entropy guard rejects short secrets at startup
 */

const ORIG_SECRET = process.env['CSRF_SECRET'];
const ORIG_PREV = process.env['CSRF_SECRET_PREV'];

// 32-byte UTF-8 strings (the minimum entropy bar)
const SECRET_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 38 chars (rejected later · repeats)
const HIGH_ENTROPY_A = 'qF7T3vJL92zXp8MeB6sNcW1uHk5RyG4DaPoZ';
const HIGH_ENTROPY_B = 'eY8K2bV9wXcZqL4mN7Rt6sUjGfHpD3aoP5iE';

function sessionTokenSignedWith(sessionId: string, secret: string): string {
  const timestamp = Date.now().toString();
  const data = `${sessionId}:${timestamp}`;
  const signature = createHmac('sha256', secret).update(data).digest('hex');
  return `${data}:${signature}`;
}

beforeEach(() => {
  resetCsrfCache();
});

afterEach(() => {
  if (ORIG_SECRET === undefined) delete process.env['CSRF_SECRET'];
  else process.env['CSRF_SECRET'] = ORIG_SECRET;
  if (ORIG_PREV === undefined) delete process.env['CSRF_SECRET_PREV'];
  else process.env['CSRF_SECRET_PREV'] = ORIG_PREV;
  resetCsrfCache();
});

describe('CSRF rotation (WEB-33)', () => {
  it('accepts tokens signed with the current secret', () => {
    process.env['CSRF_SECRET'] = HIGH_ENTROPY_A;
    delete process.env['CSRF_SECRET_PREV'];
    resetCsrfCache();

    const token = generateCsrfToken('session-1');
    expect(verifyCsrfToken(token, 'session-1')).toBe(true);
  });

  it('rejects tokens signed with a different secret when no PREV is set', () => {
    process.env['CSRF_SECRET'] = HIGH_ENTROPY_A;
    delete process.env['CSRF_SECRET_PREV'];
    resetCsrfCache();

    // Forge a token using a different secret
    const forged = sessionTokenSignedWith('session-1', HIGH_ENTROPY_B);
    expect(verifyCsrfToken(forged, 'session-1')).toBe(false);
  });

  it('accepts tokens signed with the previous secret during the rotation window', () => {
    process.env['CSRF_SECRET'] = HIGH_ENTROPY_A;
    process.env['CSRF_SECRET_PREV'] = HIGH_ENTROPY_B;
    resetCsrfCache();

    const oldToken = sessionTokenSignedWith('session-1', HIGH_ENTROPY_B);
    expect(verifyCsrfToken(oldToken, 'session-1')).toBe(true);

    // And the new secret still works
    const newToken = generateCsrfToken('session-1');
    expect(verifyCsrfToken(newToken, 'session-1')).toBe(true);
  });

  it('rejects old tokens after PREV is removed (window closed)', () => {
    // First, prove the old token works under PREV
    process.env['CSRF_SECRET'] = HIGH_ENTROPY_A;
    process.env['CSRF_SECRET_PREV'] = HIGH_ENTROPY_B;
    resetCsrfCache();
    const oldToken = sessionTokenSignedWith('session-1', HIGH_ENTROPY_B);
    expect(verifyCsrfToken(oldToken, 'session-1')).toBe(true);

    // Remove the PREV · old tokens should now fail
    delete process.env['CSRF_SECRET_PREV'];
    resetCsrfCache();
    expect(verifyCsrfToken(oldToken, 'session-1')).toBe(false);
  });

  it('rejects a CSRF_SECRET shorter than 32 bytes', () => {
    process.env['CSRF_SECRET'] = 'too-short';
    delete process.env['CSRF_SECRET_PREV'];
    resetCsrfCache();

    expect(() => generateCsrfToken('session-1')).toThrow(/at least 32 bytes/);
  });

  it('rejects a CSRF_SECRET_PREV shorter than 32 bytes', () => {
    process.env['CSRF_SECRET'] = HIGH_ENTROPY_A;
    process.env['CSRF_SECRET_PREV'] = 'short';
    resetCsrfCache();

    // Verify-side reads PREV lazily; trigger it via a forged token
    const oldToken = sessionTokenSignedWith('session-1', 'short');
    expect(() => verifyCsrfToken(oldToken, 'session-1')).toThrow(/at least 32 bytes/);
  });

  it('repeated-character secret still passes if length ≥ 32 (entropy check is byte-length only)', () => {
    // SECRET_A = 'a' * 38 · long enough for the byte-length guard. The repeated-
    // char heuristic is in desktop-token's stricter assertHighEntropyKeysource(),
    // not in CSRF (the CSRF secret is an HMAC key · length ≥ 32 random bytes
    // is the correctness bar, and operators are expected to use crypto.randomBytes).
    process.env['CSRF_SECRET'] = SECRET_A;
    delete process.env['CSRF_SECRET_PREV'];
    resetCsrfCache();
    expect(() => generateCsrfToken('session-1')).not.toThrow();
  });
});

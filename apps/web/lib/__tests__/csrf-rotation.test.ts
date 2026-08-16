import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

import { generateCsrfToken, verifyCsrfToken, resetCsrfCache } from '../csrf';

const ORIG_SECRET = process.env['CSRF_SECRET'];
const ORIG_PREV = process.env['CSRF_SECRET_PREV'];

const SECRET_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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

    const forged = sessionTokenSignedWith('session-1', HIGH_ENTROPY_B);
    expect(verifyCsrfToken(forged, 'session-1')).toBe(false);
  });

  it('accepts tokens signed with the previous secret during the rotation window', () => {
    process.env['CSRF_SECRET'] = HIGH_ENTROPY_A;
    process.env['CSRF_SECRET_PREV'] = HIGH_ENTROPY_B;
    resetCsrfCache();

    const oldToken = sessionTokenSignedWith('session-1', HIGH_ENTROPY_B);
    expect(verifyCsrfToken(oldToken, 'session-1')).toBe(true);

    const newToken = generateCsrfToken('session-1');
    expect(verifyCsrfToken(newToken, 'session-1')).toBe(true);
  });

  it('rejects old tokens after PREV is removed (window closed)', () => {
    process.env['CSRF_SECRET'] = HIGH_ENTROPY_A;
    process.env['CSRF_SECRET_PREV'] = HIGH_ENTROPY_B;
    resetCsrfCache();
    const oldToken = sessionTokenSignedWith('session-1', HIGH_ENTROPY_B);
    expect(verifyCsrfToken(oldToken, 'session-1')).toBe(true);

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

    const oldToken = sessionTokenSignedWith('session-1', 'short');
    expect(() => verifyCsrfToken(oldToken, 'session-1')).toThrow(/at least 32 bytes/);
  });

  it('repeated-character secret still passes if length ≥ 32 (entropy check is byte-length only)', () => {
    process.env['CSRF_SECRET'] = SECRET_A;
    delete process.env['CSRF_SECRET_PREV'];
    resetCsrfCache();
    expect(() => generateCsrfToken('session-1')).not.toThrow();
  });
});

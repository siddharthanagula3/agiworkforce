import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateCsrfToken, resetCsrfCache, verifyCsrfToken } from '../csrf';

const CONFIGURED_SECRET = 'qF7T3vJL92zXp8MeB6sNcW1uHk5RyG4DaPoZ';

beforeEach(() => {
  vi.stubEnv('CSRF_SECRET', undefined);
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('NEXT_PHASE', undefined);
  resetCsrfCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetCsrfCache();
});

describe('CSRF secret in a deployed runtime', () => {
  it.each([
    ['a production deployment', 'VERCEL_ENV', 'production'],
    ['a preview deployment', 'VERCEL_ENV', 'preview'],
    ['a self-hosted production runtime', 'NODE_ENV', 'production'],
  ])('refuses to mint a token without CSRF_SECRET in %s', (_label, name, value) => {
    vi.stubEnv(name, value);

    expect(() => generateCsrfToken('session-1')).toThrow(/needs CSRF_SECRET/);
  });

  it('refuses to verify a presented token without CSRF_SECRET instead of checking it against a per-instance secret', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const token = generateCsrfToken('session-1');
    resetCsrfCache();
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(() => verifyCsrfToken(token, 'session-1')).toThrow(/needs CSRF_SECRET/);
  });

  it('signs and verifies with the configured secret', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('CSRF_SECRET', CONFIGURED_SECRET);

    const token = generateCsrfToken('session-1');

    expect(verifyCsrfToken(token, 'session-1')).toBe(true);
  });
});

describe('CSRF secret in development and test', () => {
  it.each(['development', 'test'])(
    'falls back to one secret for the whole process in %s',
    (env) => {
      vi.stubEnv('NODE_ENV', env);

      const token = generateCsrfToken('session-1');

      expect(verifyCsrfToken(token, 'session-1')).toBe(true);
      expect(verifyCsrfToken(generateCsrfToken('session-2'), 'session-2')).toBe(true);
    },
  );
});

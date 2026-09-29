import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() },
}));

import { generateCsrfToken, resetCsrfCache, verifyCsrfToken } from '../csrf';

const CONFIGURED_SECRET = 'qF7T3vJL92zXp8MeB6sNcW1uHk5RyG4DaPoZ';

beforeEach(() => {
  vi.stubEnv('CSRF_SECRET', undefined);
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('NEXT_PHASE', undefined);
  warn.mockClear();
  resetCsrfCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetCsrfCache();
});

describe('CSRF secret in production', () => {
  it.each([
    ['a Vercel production deployment', { VERCEL_ENV: 'production', NODE_ENV: 'production' }],
    ['a self-hosted production runtime', { NODE_ENV: 'production' }],
  ])('refuses to mint a token without CSRF_SECRET in %s', (_label, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    expect(() => generateCsrfToken('session-1')).toThrow(/needs CSRF_SECRET/);
    expect(warn).not.toHaveBeenCalled();
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

describe('CSRF secret outside production', () => {
  it.each([
    ['a preview deployment', { VERCEL_ENV: 'preview', NODE_ENV: 'production' }],
    ['a Vercel development deployment', { VERCEL_ENV: 'development', NODE_ENV: 'production' }],
    ['development', { NODE_ENV: 'development' }],
    ['test', { NODE_ENV: 'test' }],
  ])('warns once and falls back to one secret for the whole process in %s', (_label, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    const token = generateCsrfToken('session-1');

    expect(verifyCsrfToken(token, 'session-1')).toBe(true);
    expect(verifyCsrfToken(generateCsrfToken('session-2'), 'session-2')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[1])).toMatch(/CSRF_SECRET is not set/);
  });
});

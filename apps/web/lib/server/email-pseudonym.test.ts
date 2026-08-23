import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: mocks.error, warn: vi.fn(), debug: vi.fn() },
}));

const EMAIL = 'Visitor@Example.com';
const NORMALIZED = 'visitor@example.com';
const PEPPER = 'a'.repeat(64);

const sha256 = createHash('sha256').update(NORMALIZED).digest('hex');
const hmac = createHmac('sha256', PEPPER).update(NORMALIZED).digest('hex');

async function loadModule(): Promise<typeof import('./email-pseudonym')> {
  vi.resetModules();
  return import('./email-pseudonym');
}

beforeEach(() => {
  mocks.error.mockClear();
  vi.stubEnv('EMAIL_HASH_PEPPER', undefined);
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('NEXT_PHASE', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('pseudonymizeEmail', () => {
  it('keys the pseudonym with the pepper when it is set', async () => {
    vi.stubEnv('EMAIL_HASH_PEPPER', PEPPER);
    const { pseudonymizeEmail } = await loadModule();

    const value = pseudonymizeEmail(EMAIL);

    expect(value).toBe(hmac);
    expect(value).not.toBe(sha256);
  });

  it('falls back to the unkeyed digest outside production and says so once', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { pseudonymizeEmail } = await loadModule();

    expect(pseudonymizeEmail(EMAIL)).toBe(sha256);
    expect(pseudonymizeEmail('other@example.com')).toBe(
      createHash('sha256').update('other@example.com').digest('hex'),
    );
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0]?.[1]).toContain('EMAIL_HASH_PEPPER');
  });

  it('throws instead of writing an unkeyed digest when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { pseudonymizeEmail } = await loadModule();

    expect(() => pseudonymizeEmail(EMAIL)).toThrow(/EMAIL_HASH_PEPPER is not set/);
    expect(() => pseudonymizeEmail(EMAIL)).toThrow(/reversible by dictionary/);
  });

  it('throws when VERCEL_ENV is production even if NODE_ENV is not', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { pseudonymizeEmail } = await loadModule();

    expect(() => pseudonymizeEmail(EMAIL)).toThrow(/EMAIL_HASH_PEPPER is not set/);
  });

  it('does not throw during the production build phase or on preview', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const built = await loadModule();
    expect(built.pseudonymizeEmail(EMAIL)).toBe(sha256);

    vi.stubEnv('NEXT_PHASE', undefined);
    vi.stubEnv('VERCEL_ENV', 'preview');
    const preview = await loadModule();
    expect(preview.pseudonymizeEmail(EMAIL)).toBe(sha256);
  });
});

describe('emailPseudonymCandidates', () => {
  it('matches both the peppered and the legacy pseudonym when the pepper is set', async () => {
    vi.stubEnv('EMAIL_HASH_PEPPER', PEPPER);
    const { emailPseudonymCandidates } = await loadModule();

    expect(emailPseudonymCandidates(EMAIL)).toEqual([hmac, sha256]);
  });

  it('still matches legacy rows in production without the pepper instead of throwing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { emailPseudonymCandidates } = await loadModule();

    expect(emailPseudonymCandidates(EMAIL)).toEqual([sha256]);
  });
});

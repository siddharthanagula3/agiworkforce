import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClerkAuthAdapter } from '../adapters/clerk';
import { DataLayerConfigError } from '../types';
import { createAuthClient } from '../factory';

describe('ClerkAuthAdapter', () => {
  it('normalizes verified Clerk session claims', async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      sub: 'user_123',
      email: 'founder@example.com',
      sid: 'sess_123',
    });

    const auth = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      authorizedParties: ['http://localhost:3000'],
      verifyToken,
    });

    await expect(auth.verifyJwt('session.jwt')).resolves.toEqual({
      userId: 'user_123',
      email: 'founder@example.com',
      raw: {
        sub: 'user_123',
        email: 'founder@example.com',
        sid: 'sess_123',
      },
    });
    expect(verifyToken).toHaveBeenCalledWith('session.jwt', {
      jwtKey: 'test-jwt-key',
      authorizedParties: ['http://localhost:3000'],
    });
  });

  it('returns null for invalid tokens and malformed claims', async () => {
    const invalid = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      authorizedParties: ['http://localhost:3000'],
      verifyToken: vi.fn().mockRejectedValue(new Error('bad token')),
    });
    await expect(invalid.verifyJwt('bad.jwt')).resolves.toBeNull();

    const malformed = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      authorizedParties: ['http://localhost:3000'],
      verifyToken: vi.fn().mockResolvedValue({ sid: 'sess_123' }),
    });
    await expect(malformed.verifyJwt('missing-sub.jwt')).resolves.toBeNull();
  });

  it('refuses to verify a token when no authorized party is configured', async () => {
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'user_123' });
    const unbound = new ClerkAuthAdapter({ jwtKey: 'test-jwt-key', verifyToken });

    await expect(unbound.verifyJwt('cross-party.jwt')).rejects.toThrow(DataLayerConfigError);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('trims configured authorized parties before enforcing them', async () => {
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'user_123' });
    const auth = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      authorizedParties: [' https://agiworkforce.com ', '', 'chrome-extension://ext-id'],
      verifyToken,
    });

    await auth.verifyJwt('session.jwt');

    expect(verifyToken).toHaveBeenCalledWith('session.jwt', {
      jwtKey: 'test-jwt-key',
      authorizedParties: ['https://agiworkforce.com', 'chrome-extension://ext-id'],
    });
  });

  it('requires a Clerk verification key unless a test verifier is injected', () => {
    expect(() => new ClerkAuthAdapter({})).toThrow('Clerk auth adapter requires CLERK_JWT_KEY');
  });

  it('does not advertise refresh-token support', () => {
    const auth = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      verifyToken: vi.fn(),
    });

    expect(auth.refreshToken).toBeUndefined();
  });
});

describe('createAuthClient Clerk authorized parties', () => {
  const ENV_KEYS = ['CLERK_JWT_KEY', 'CLERK_AUTHORIZED_PARTIES', 'NEXT_PUBLIC_APP_URL'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env['CLERK_JWT_KEY'] = 'test-jwt-key';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const partiesOf = (auth: unknown): string[] | undefined =>
    (auth as { config: { authorizedParties?: string[] } }).config.authorizedParties;

  it('passes the configured allowlist through to the adapter', () => {
    process.env['CLERK_AUTHORIZED_PARTIES'] = 'https://agiworkforce.com, chrome-extension://ext-id';
    expect(partiesOf(createAuthClient())).toEqual([
      'https://agiworkforce.com',
      'chrome-extension://ext-id',
    ]);
  });

  it('falls back to the deployment origin when the allowlist env is unset', () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com/app';
    expect(partiesOf(createAuthClient())).toEqual(['https://agiworkforce.com']);
  });
});

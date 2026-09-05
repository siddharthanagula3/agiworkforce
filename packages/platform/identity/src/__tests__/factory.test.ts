import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({}),
  clerkClient: async () => ({ users: {}, sessions: {} }),
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => false,
}));

const {
  DEFAULT_IDENTITY_PROVIDER,
  IDENTITY_PROVIDER_ENV,
  resolveIdentityProvider,
  selectIdentityProvider,
} = await import('../factory');
const { IdentityConfigError } = await import('../types');

const saved = process.env[IDENTITY_PROVIDER_ENV];

afterEach(() => {
  if (saved === undefined) delete process.env[IDENTITY_PROVIDER_ENV];
  else process.env[IDENTITY_PROVIDER_ENV] = saved;
});

describe('provider selection', () => {
  it('defaults to the clerk provider when nothing is configured', () => {
    delete process.env[IDENTITY_PROVIDER_ENV];
    expect(selectIdentityProvider()).toBe(DEFAULT_IDENTITY_PROVIDER);
    expect(resolveIdentityProvider().name).toBe(DEFAULT_IDENTITY_PROVIDER);
  });

  it('reads the configured provider case-insensitively', () => {
    process.env[IDENTITY_PROVIDER_ENV] = 'CLERK';
    expect(selectIdentityProvider()).toBe('clerk');
  });

  it('lets an explicit option win over the environment', () => {
    process.env[IDENTITY_PROVIDER_ENV] = 'clerk';
    expect(selectIdentityProvider({ provider: 'clerk' })).toBe('clerk');
  });

  it('refuses a provider it has no adapter for', () => {
    process.env[IDENTITY_PROVIDER_ENV] = 'auth0';
    expect(() => selectIdentityProvider()).toThrow(IdentityConfigError);
  });
});

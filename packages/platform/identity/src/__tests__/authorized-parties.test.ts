import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({}),
  clerkClient: async () => ({ users: {}, sessions: {} }),
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => false,
}));

const { ClerkIdentityProvider } = await import('../adapters/clerk');
const { IdentityConfigError } = await import('../types');
const { resolveDeploymentOrigin } = await import('../deployment-origin');

describe('authorized parties', () => {
  it('uses the configured allowlist and trims blank entries', () => {
    const provider = new ClerkIdentityProvider({
      authorizedParties: [' https://a.test ', '', 'chrome-extension://abc'],
    });
    expect(provider.authorizedParties()).toEqual(['https://a.test', 'chrome-extension://abc']);
  });

  it('falls back to this deployment origin when no allowlist is configured', () => {
    const provider = new ClerkIdentityProvider({
      authorizedParties: [],
      appUrl: 'https://app.test/some/path',
    });
    expect(provider.authorizedParties()).toEqual(['https://app.test']);
  });

  it('throws rather than verifying against an empty allowlist', () => {
    const provider = new ClerkIdentityProvider({ authorizedParties: [], appUrl: 'not a url' });
    expect(() => provider.authorizedParties()).toThrow(IdentityConfigError);
  });

  it('reads an origin out of an absolute app url only', () => {
    expect(resolveDeploymentOrigin('https://app.test/path?q=1')).toBe('https://app.test');
    expect(resolveDeploymentOrigin('/relative')).toBeNull();
    expect(resolveDeploymentOrigin('')).toBeNull();
  });
});

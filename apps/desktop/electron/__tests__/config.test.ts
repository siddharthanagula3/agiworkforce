import { describe, expect, it } from 'vitest';
import { clerkDevelopmentHost, isAllowedClerkFrontendApi } from '../config';

function publishableKey(prefix: 'pk_test_' | 'pk_live_', host: string): string {
  return `${prefix}${Buffer.from(`${host}$`, 'utf8').toString('base64')}`;
}

describe('the Clerk tenant a development build signs in through', () => {
  it('is the host its own publishable key names', () => {
    expect(
      clerkDevelopmentHost(publishableKey('pk_test_', 'sharp-cat-12.clerk.accounts.dev')),
    ).toBe('sharp-cat-12.clerk.accounts.dev');
    expect(
      clerkDevelopmentHost(publishableKey('pk_test_', 'Sharp-Cat-12.Clerk.Accounts.Dev')),
    ).toBe('sharp-cat-12.clerk.accounts.dev');
  });

  it('is nothing when no key is set, which is how a packaged build runs', () => {
    expect(clerkDevelopmentHost(undefined)).toBeNull();
    expect(clerkDevelopmentHost('')).toBeNull();
  });

  it('is nothing for a production key, whose host the window already holds', () => {
    expect(clerkDevelopmentHost(publishableKey('pk_live_', 'clerk.agiworkforce.com'))).toBeNull();
  });

  it('never widens the window to a host that is not a single Clerk tenant', () => {
    for (const key of [
      publishableKey('pk_test_', 'evil.example.com'),
      publishableKey('pk_test_', 'clerk.accounts.dev'),
      publishableKey('pk_test_', 'clerk.accounts.dev.evil.test'),
      'pk_test_not-base64-payload',
      'sk_test_abc',
    ]) {
      expect(clerkDevelopmentHost(key), key).toBeNull();
    }
  });
});

describe('the Clerk frontend API a renderer may send a credential to', () => {
  it('is our own domain, or the one development tenant this build names', () => {
    expect(isAllowedClerkFrontendApi('clerk.agiworkforce.com', null)).toBe(true);
    expect(isAllowedClerkFrontendApi('Clerk.AGIWorkforce.com', null)).toBe(true);
    expect(
      isAllowedClerkFrontendApi(
        'sharp-cat-12.clerk.accounts.dev',
        'sharp-cat-12.clerk.accounts.dev',
      ),
    ).toBe(true);
  });

  it('refuses any other host a publishable key can name', () => {
    for (const host of [
      'evil.example.com',
      'agiworkforce.com.evil.test',
      'other-tenant-1.clerk.accounts.dev',
      'sharp-cat-12.clerk.accounts.dev',
    ]) {
      expect(isAllowedClerkFrontendApi(host, null), host).toBe(false);
    }
  });
});

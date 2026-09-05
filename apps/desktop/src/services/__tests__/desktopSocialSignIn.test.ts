import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
  isElectronHost: false,
}));

const clerk = {
  createOauthSignIn: vi.fn(),
  reloadSignInWithNonce: vi.fn(),
  createSessionToken: vi.fn(),
};

vi.mock('../clerkNativeAuth', async () => {
  const actual = await vi.importActual<typeof import('../clerkNativeAuth')>('../clerkNativeAuth');
  return {
    ...actual,
    createOauthSignIn: (...args: unknown[]) => clerk.createOauthSignIn(...args),
    reloadSignInWithNonce: (...args: unknown[]) => clerk.reloadSignInWithNonce(...args),
    createSessionToken: (...args: unknown[]) => clerk.createSessionToken(...args),
  };
});

import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { ClerkAuthError, type ClerkSignIn } from '../clerkNativeAuth';
import {
  configuredSocialProviders,
  socialSignInStrategy,
  SSO_REDIRECT_URL,
  beginSocialSignIn,
  completeSocialSignIn,
} from '../desktopSocialSignIn';

const openMock = vi.mocked(shellOpen);

function signIn(overrides: Partial<ClerkSignIn> = {}): ClerkSignIn {
  return {
    id: 'sia_1',
    status: 'needs_first_factor',
    identifier: null,
    createdSessionId: null,
    supportedFirstFactors: [],
    supportedSecondFactors: [],
    externalVerificationRedirectUrl: null,
    firstFactorVerificationStatus: null,
    ...overrides,
  };
}

describe('desktopSocialSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the provider catalogue the web surface uses, not a second list', () => {
    const providers = configuredSocialProviders();

    expect(providers.length).toBeGreaterThan(0);
    expect(providers.map((provider) => socialSignInStrategy(provider.id))).toEqual(
      providers.map((provider) => `oauth_${provider.id}`),
    );
    expect(SSO_REDIRECT_URL).toBe('agiworkforce://sso-callback');
  });

  it('keeps every provider on the system browser, which is why the list is shared', () => {
    for (const provider of configuredSocialProviders()) {
      expect(socialSignInStrategy(provider.id)).toMatch(/^oauth_/);
      expect(provider.label.length).toBeGreaterThan(0);
    }
  });

  it('opens the provider URL in the system browser, not a child webview', async () => {
    clerk.createOauthSignIn.mockResolvedValue({
      signIn: signIn(),
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
    });

    await beginSocialSignIn('oauth_google');

    expect(clerk.createOauthSignIn).toHaveBeenCalledWith('oauth_google', SSO_REDIRECT_URL);
    expect(openMock).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });

  it('refuses an insecure provider URL', async () => {
    clerk.createOauthSignIn.mockResolvedValue({
      signIn: signIn(),
      authorizationUrl: 'http://accounts.google.com/o/oauth2/v2/auth',
    });

    await expect(beginSocialSignIn('oauth_google')).rejects.toBeInstanceOf(ClerkAuthError);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('completes the callback and returns the Clerk session token', async () => {
    clerk.reloadSignInWithNonce.mockResolvedValue(
      signIn({ status: 'complete', createdSessionId: 'sess_9' }),
    );
    clerk.createSessionToken.mockResolvedValue('clerk.session.jwt');

    await expect(completeSocialSignIn(signIn(), 'nonce-1')).resolves.toBe('clerk.session.jwt');
    expect(clerk.reloadSignInWithNonce).toHaveBeenCalledWith('sia_1', 'nonce-1');
    expect(clerk.createSessionToken).toHaveBeenCalledWith('sess_9');
  });

  it('routes a provider account that still needs MFA back to email sign-in', async () => {
    clerk.reloadSignInWithNonce.mockResolvedValue(signIn({ status: 'needs_second_factor' }));

    const failure = (await completeSocialSignIn(signIn(), 'nonce-1').catch(
      (error: unknown) => error,
    )) as ClerkAuthError;

    expect(failure.kind).toBe('mfa_required');
    expect(failure.message).toMatch(/second factor/i);
    expect(clerk.createSessionToken).not.toHaveBeenCalled();
  });

  it('never silently creates an account for an unlinked provider identity', async () => {
    clerk.reloadSignInWithNonce.mockResolvedValue(
      signIn({ firstFactorVerificationStatus: 'transferable' }),
    );

    const failure = (await completeSocialSignIn(signIn(), 'nonce-1').catch(
      (error: unknown) => error,
    )) as ClerkAuthError;

    expect(failure.kind).toBe('identifier_not_found');
    expect(failure.message).toMatch(/no agi account is linked/i);
    expect(clerk.createSessionToken).not.toHaveBeenCalled();
  });

  it('reports an incomplete callback instead of returning an empty session', async () => {
    clerk.reloadSignInWithNonce.mockResolvedValue(signIn({ status: 'needs_first_factor' }));

    const failure = (await completeSocialSignIn(signIn(), 'nonce-1').catch(
      (error: unknown) => error,
    )) as ClerkAuthError;

    expect(failure.kind).toBe('unexpected');
    expect(failure.message).toMatch(/did not complete/i);
  });

  it('does not mint a session when the reload says complete but names no session', async () => {
    clerk.reloadSignInWithNonce.mockResolvedValue(
      signIn({ status: 'complete', createdSessionId: null }),
    );

    await expect(completeSocialSignIn(signIn(), 'nonce-1')).rejects.toBeInstanceOf(ClerkAuthError);
    expect(clerk.createSessionToken).not.toHaveBeenCalled();
  });
});

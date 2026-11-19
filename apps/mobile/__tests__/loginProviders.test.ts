import { resolveAuthProviders } from '@agiworkforce/client-runtime';
import {
  appleFlowWithoutSession,
  buildIncludesSignInWithApple,
  loginProvidersToRender,
} from '../src/features/auth/services/loginProviders';

const ids = (configured: string | undefined, platform: string, appleOffered: boolean) =>
  loginProvidersToRender(resolveAuthProviders(configured), platform, appleOffered).map(
    (provider) => provider.id,
  );

describe('login providers on iOS (App Store Guideline 4.8)', () => {
  it('adds Apple beside the default third-party providers when Apple can be offered', () => {
    expect(ids(undefined, 'ios', true)).toEqual(['google', 'github', 'apple']);
    expect(ids('google,github', 'ios', true)).toEqual(['google', 'github', 'apple']);
    expect(ids('microsoft', 'ios', true)).toEqual(['microsoft', 'apple']);
  });

  it('keeps a configured list that already offers Apple', () => {
    expect(ids('google,github,apple', 'ios', true)).toEqual(['google', 'github', 'apple']);
    expect(ids('apple', 'ios', true)).toEqual(['apple']);
  });

  it('labels the added Apple option like a configured one', () => {
    const added = loginProvidersToRender(resolveAuthProviders('google'), 'ios', true);
    expect(added.at(-1)).toEqual(resolveAuthProviders('apple')[0]);
  });

  it('shows no provider at all when the build cannot offer Apple', () => {
    expect(ids(undefined, 'ios', false)).toEqual([]);
    expect(ids('google,github', 'ios', false)).toEqual([]);
    expect(ids('google,github,apple', 'ios', false)).toEqual([]);
    expect(ids('apple', 'ios', false)).toEqual([]);
  });
});

describe('login providers off iOS', () => {
  it.each([true, false])('keeps third-party providers and never offers native Apple', (offered) => {
    expect(ids(undefined, 'android', offered)).toEqual(['google', 'github']);
    expect(ids('google,github,apple', 'android', offered)).toEqual(['google', 'github']);
    expect(ids('apple', 'android', offered)).toEqual([]);
  });
});

describe('whether the build carries Sign in with Apple', () => {
  it('reads the config plugin that adds the entitlement, with or without options', () => {
    expect(buildIncludesSignInWithApple(['expo-router', 'expo-apple-authentication'])).toBe(true);
    expect(buildIncludesSignInWithApple([['expo-apple-authentication', {}]])).toBe(true);
  });

  it('treats a build without the plugin as unable to sign in with Apple', () => {
    expect(buildIncludesSignInWithApple(['expo-router', ['expo-notifications', {}]])).toBe(false);
    expect(buildIncludesSignInWithApple([])).toBe(false);
    expect(buildIncludesSignInWithApple(undefined)).toBe(false);
  });
});

describe('an Apple flow that returned no session', () => {
  const setActive = jest.fn();
  const before = { signIn: 'sia_old', signUp: 'sua_old' };

  it('is Clerk not loaded when the hook had nothing to activate with', () => {
    expect(appleFlowWithoutSession({ createdSessionId: null }, before)).toBe('not_loaded');
  });

  it('is a cancel when no new attempt was created', () => {
    expect(
      appleFlowWithoutSession(
        {
          createdSessionId: null,
          setActive,
          signIn: { id: 'sia_old' },
          signUp: { id: 'sua_old' },
        },
        before,
      ),
    ).toBe('cancelled');
    expect(
      appleFlowWithoutSession(
        { createdSessionId: null, setActive, signIn: { id: null }, signUp: {} },
        { signIn: undefined, signUp: null },
      ),
    ).toBe('cancelled');
  });

  it('is incomplete when Clerk created a sign-up or sign-in it did not finish', () => {
    expect(
      appleFlowWithoutSession(
        {
          createdSessionId: null,
          setActive,
          signIn: { id: 'sia_old' },
          signUp: { id: 'sua_new' },
        },
        before,
      ),
    ).toBe('incomplete');
    expect(
      appleFlowWithoutSession(
        {
          createdSessionId: null,
          setActive,
          signIn: { id: 'sia_new' },
          signUp: { id: 'sua_new' },
        },
        before,
      ),
    ).toBe('incomplete');
  });
});

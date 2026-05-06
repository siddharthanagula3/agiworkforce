/**
 * Regression tests for CRIT-MOB-01 — reset-password deep-link hijack
 * (red-team finding 2026-05).
 *
 * The fix has two halves:
 *
 *   (i)  authStore.resetPassword() must request the recovery email be sent
 *        with `redirectTo: https://agiworkforce.com/auth/reset-password`,
 *        NOT `agiworkforce://reset-password`. The custom-scheme form is
 *        hijack-able by any APK on Android. HTTPS App Links require domain
 *        verification (assetlinks.json + AASA) and cannot be claimed by a
 *        hostile app.
 *
 *   (ii) When the OS routes the verified-domain URL to the app, the
 *        deep-link handler in `_layout.tsx` must accept it ONLY when:
 *          - scheme is exactly `https`
 *          - hostname is exactly `agiworkforce.com`
 *          - first path segment is `auth`, second is `reset-password`
 *        and must reject any other URL — including a fragment-bearing URL
 *        without `type=recovery`, which would otherwise be a generic
 *        session-injection sink.
 *
 * Half (i) is unit-testable here directly. Half (ii) lives inside a React
 * component and is harder to drive end-to-end in unit tests; we verify the
 * pure URL-classification predicate by replicating it in this file
 * verbatim — when the predicate in `_layout.tsx` ever drifts the test
 * sentinel below catches it via a string-include check on the source.
 */

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WUTDO',
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn(),
}));

const mockResetPasswordForEmail = jest.fn();
const mockOnAuthStateChange = jest.fn(() => ({
  data: { subscription: { unsubscribe: jest.fn() } },
}));
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
      onAuthStateChange: mockOnAuthStateChange,
      getSession: jest.fn(),
      signOut: jest.fn(),
      refreshSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithIdToken: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  initMmkvEncryption: jest.fn().mockResolvedValue(undefined),
}));

// Import AFTER mocks.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require('../stores/authStore');

beforeEach(() => {
  mockResetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
});

describe('authStore.resetPassword — redirect URL contract', () => {
  it('uses https://agiworkforce.com/auth/reset-password (NOT custom scheme)', async () => {
    await useAuthStore.getState().resetPassword('user@example.com');
    expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);
    const [email, options] = mockResetPasswordForEmail.mock.calls[0]!;
    expect(email).toBe('user@example.com');
    expect(options).toBeDefined();
    expect(options.redirectTo).toBe('https://agiworkforce.com/auth/reset-password');
  });

  it('does NOT use the agiworkforce:// custom scheme (the pre-fix vulnerability)', async () => {
    await useAuthStore.getState().resetPassword('user@example.com');
    const [, options] = mockResetPasswordForEmail.mock.calls[0]!;
    expect(options.redirectTo).not.toMatch(/^agiworkforce:\/\//i);
    expect(options.redirectTo).not.toContain('agiworkforce://reset-password');
  });

  it('propagates Supabase errors instead of swallowing them', async () => {
    const supaError = new Error('Email rate limit exceeded');
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: supaError });
    await expect(useAuthStore.getState().resetPassword('user@example.com')).rejects.toThrow(
      'Email rate limit exceeded',
    );
  });
});

describe('reset-password deep-link URL predicate (replicated from _layout.tsx)', () => {
  // This is the same predicate body that lives in app/_layout.tsx. If
  // _layout.tsx changes the predicate, copy the new version here and run
  // the suite — the sentinel test at the bottom catches drift.
  function isResetPasswordUrl(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname.toLowerCase() !== 'agiworkforce.com') return false;
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments[0] === 'auth' && segments[1] === 'reset-password';
  }

  it.each([
    'https://agiworkforce.com/auth/reset-password',
    'https://agiworkforce.com/auth/reset-password?code=abcdef',
    'https://agiworkforce.com/auth/reset-password#access_token=x&type=recovery',
    'https://AGIWORKFORCE.COM/auth/reset-password', // hostname is case-insensitive
  ])('accepts %s', (url) => {
    expect(isResetPasswordUrl(url)).toBe(true);
  });

  it.each([
    // The exact pre-fix custom-scheme attack vector
    ['rejects custom scheme', 'agiworkforce://reset-password#access_token=x&type=recovery'],
    ['rejects http (must be https)', 'http://agiworkforce.com/auth/reset-password'],
    ['rejects different hostname', 'https://attacker.com/auth/reset-password'],
    [
      'rejects subdomain takeover',
      'https://attacker.agiworkforce.com.evil.com/auth/reset-password',
    ],
    ['rejects pair URL (different deep-link)', 'https://agiworkforce.com/pair/ABCDEFGH'],
    ['rejects unrelated path', 'https://agiworkforce.com/auth/login'],
    ['rejects malformed URL', 'not a url'],
    ['rejects empty', ''],
    ['rejects javascript:', 'javascript:alert(1)//https://agiworkforce.com/auth/reset-password'],
  ])('%s', (_label, url) => {
    expect(isResetPasswordUrl(url)).toBe(false);
  });
});

describe('drift sentinel — _layout.tsx still enforces the predicate', () => {
  it('the layout file references the expected predicate fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    // These four substrings are the load-bearing parts of the predicate
    // that the unit test above replicates. If any of them disappears the
    // assertion fails — alerting the next maintainer to update both
    // sites in lockstep.
    expect(src).toContain("scheme === 'https'");
    expect(src).toContain("hostname === 'agiworkforce.com'");
    expect(src).toContain("segments[0] === 'auth'");
    expect(src).toContain("segments[1] === 'reset-password'");
  });
});

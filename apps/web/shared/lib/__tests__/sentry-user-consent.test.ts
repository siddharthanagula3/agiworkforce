import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TELEMETRY_CONSENT_STORAGE_KEY } from '../../../lib/sentry-shared';

const setUserSpy = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  setUser: (...args: unknown[]) => setUserSpy(...args),
  setTag: vi.fn(),
  setTags: vi.fn(),
  setContext: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  startInactiveSpan: vi.fn(),
  isInitialized: vi.fn(() => true),
  flush: vi.fn(),
  withProfiler: vi.fn(),
  ErrorBoundary: null,
}));

import { clearUser, setUser } from '../sentry';

function grantConsent(value: boolean) {
  window.localStorage.setItem(TELEMETRY_CONSENT_STORAGE_KEY, value ? 'true' : 'false');
}

describe('Sentry identity is gated on telemetry consent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setUserSpy.mockClear();
  });

  it('attaches and stores a stable id once telemetry consent is granted', () => {
    grantConsent(true);

    setUser({ id: 'user-123' });

    expect(setUserSpy).toHaveBeenCalledWith({ id: 'user-123' });
    expect(window.localStorage.getItem('user_id')).toBe('user-123');
  });

  it('refuses to attach or persist an id when consent was never given', () => {
    setUser({ id: 'user-123' });

    expect(setUserSpy).not.toHaveBeenCalledWith({ id: 'user-123' });
    expect(window.localStorage.getItem('user_id')).toBeNull();
  });

  it('refuses to attach or persist an id when consent is explicitly declined', () => {
    grantConsent(false);

    setUser({ id: 'user-123' });

    expect(setUserSpy).not.toHaveBeenCalledWith({ id: 'user-123' });
    expect(window.localStorage.getItem('user_id')).toBeNull();
  });

  it('detaches a previously attached id when consent is revoked mid-session', () => {
    grantConsent(true);
    setUser({ id: 'user-123' });
    expect(window.localStorage.getItem('user_id')).toBe('user-123');

    grantConsent(false);
    setUser({ id: 'user-123' });

    expect(setUserSpy).toHaveBeenLastCalledWith(null);
    expect(window.localStorage.getItem('user_id')).toBeNull();
  });

  it('clearUser detaches and forgets the stored id', () => {
    grantConsent(true);
    setUser({ id: 'user-123' });

    clearUser();

    expect(setUserSpy).toHaveBeenLastCalledWith(null);
    expect(window.localStorage.getItem('user_id')).toBeNull();
  });
});

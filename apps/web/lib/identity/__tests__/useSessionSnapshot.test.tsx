import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: 'account-a' as string | null,
    sessionId: 'session-a' as string | null,
  },
  sdk: {
    loaded: true,
    user: { id: 'account-a' } as { id: string } | null,
    session: { id: 'session-a', user: { id: 'account-a' } } as
      { id: string; user: { id: string }; getToken?: () => Promise<string | null> } | null,
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => fixtures.auth,
  useClerk: () => fixtures.sdk,
}));

import { useReadonlyIdentityLifetime, useSessionSnapshot } from '../useSessionSnapshot';

beforeEach(() => {
  fixtures.auth = { isLoaded: true, isSignedIn: true, userId: 'account-a', sessionId: 'session-a' };
  fixtures.sdk.loaded = true;
  fixtures.sdk.user = { id: 'account-a' };
  fixtures.sdk.session = { id: 'session-a', user: { id: 'account-a' } };
});

describe('live SDK session snapshot', () => {
  it('uses only the captured session token method and rejects its late result', async () => {
    let resolve!: (value: string) => void;
    const original = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const replacement = vi.fn(async () => 'token-b');
    fixtures.sdk.session!.getToken = original;
    const { result } = renderHook(() => useSessionSnapshot());
    const snapshot = result.current()!;
    const token = snapshot.getToken();
    fixtures.sdk.session = { id: 'session-b', user: { id: 'account-b' }, getToken: replacement };
    fixtures.sdk.user = { id: 'account-b' };
    resolve('token-a');
    await expect(token).resolves.toBeNull();
    expect(original).toHaveBeenCalledOnce();
    expect(replacement).not.toHaveBeenCalled();
  });

  it('does not revive after an observed SDK mismatch returns to the original object', () => {
    const { result } = renderHook(() => useSessionSnapshot());
    const snapshot = result.current()!;
    const original = fixtures.sdk.session;
    fixtures.sdk.session = null;
    expect(snapshot.isCurrent()).toBe(false);
    fixtures.sdk.session = original;
    expect(snapshot.isCurrent()).toBe(false);
  });

  it('captures only agreeing rendered and live session authority', () => {
    const { result } = renderHook(() => useSessionSnapshot());
    expect(result.current()?.isCurrent()).toBe(true);
    fixtures.sdk.user = { id: 'account-b' };
    expect(result.current()).toBeNull();
  });

  it('rejects a live account switch before React renders it', () => {
    const { result } = renderHook(() => useSessionSnapshot());
    const snapshot = result.current()!;
    fixtures.sdk.user = { id: 'account-b' };
    fixtures.sdk.session = { id: 'session-b', user: { id: 'account-b' } };
    expect(snapshot.isCurrent()).toBe(false);
    expect(result.current()).toBeNull();
  });

  it('rejects same-account relogin before React renders the new session', () => {
    const { result } = renderHook(() => useSessionSnapshot());
    const snapshot = result.current()!;
    fixtures.sdk.session = { id: 'session-new', user: { id: 'account-a' } };
    expect(snapshot.isCurrent()).toBe(false);
  });

  it('conservatively rejects replacement of a session resource with the same IDs', () => {
    const { result } = renderHook(() => useSessionSnapshot());
    const snapshot = result.current()!;
    fixtures.sdk.session = { id: 'session-a', user: { id: 'account-a' } };
    expect(snapshot.isCurrent()).toBe(false);
  });

  it('rejects signout and missing SDK readiness without a render', () => {
    const { result } = renderHook(() => useSessionSnapshot());
    const snapshot = result.current()!;
    fixtures.sdk.loaded = false;
    expect(snapshot.isCurrent()).toBe(false);
    expect(result.current()).toBeNull();
    fixtures.sdk.loaded = true;
    fixtures.sdk.session = null;
    expect(snapshot.isCurrent()).toBe(false);
  });

  it('rejects a rendered identity change even before the SDK catches up', () => {
    const { result, rerender } = renderHook(() => useSessionSnapshot());
    const snapshot = result.current()!;
    fixtures.auth = { ...fixtures.auth, sessionId: 'session-new' };
    rerender();
    expect(snapshot.isCurrent()).toBe(false);
    expect(result.current()).toBeNull();
  });
});

describe('readonly identity lifetime', () => {
  it.each([false, true])('allows a stable signed-out identity with readiness %s', (loaded) => {
    fixtures.auth = { isLoaded: loaded, isSignedIn: false, userId: null, sessionId: null };
    fixtures.sdk.loaded = loaded;
    fixtures.sdk.user = null;
    fixtures.sdk.session = null;
    const { result, rerender } = renderHook(() => useReadonlyIdentityLifetime());
    const capture = result.current;
    const lifetime = capture();
    expect(lifetime.isCurrent()).toBe(true);
    rerender();
    expect(result.current).toBe(capture);
    expect(lifetime.isCurrent()).toBe(true);
  });

  it('does not require token access or expose request authority', () => {
    const { result } = renderHook(() => useReadonlyIdentityLifetime());
    const lifetime = result.current();
    expect(lifetime.isCurrent()).toBe(true);
    expect(lifetime).not.toHaveProperty('getToken');
  });

  it('retires a loading lifetime when rendered readiness changes', () => {
    fixtures.auth.isLoaded = false;
    fixtures.sdk.loaded = false;
    const { result, rerender } = renderHook(() => useReadonlyIdentityLifetime());
    const lifetime = result.current();
    fixtures.auth.isLoaded = true;
    rerender();
    expect(lifetime.isCurrent()).toBe(false);
    fixtures.auth.isLoaded = false;
    rerender();
    expect(lifetime.isCurrent()).toBe(false);
    expect(result.current().isCurrent()).toBe(true);
  });

  it('retires on SDK readiness changes before React renders them', () => {
    const { result } = renderHook(() => useReadonlyIdentityLifetime());
    const lifetime = result.current();
    fixtures.sdk.loaded = false;
    expect(lifetime.isCurrent()).toBe(false);
    fixtures.sdk.loaded = true;
    expect(lifetime.isCurrent()).toBe(false);
  });

  it('retires on a live account switch and never revives the old lifetime', () => {
    const { result } = renderHook(() => useReadonlyIdentityLifetime());
    const lifetime = result.current();
    const originalSession = fixtures.sdk.session;
    const originalUser = fixtures.sdk.user;
    fixtures.sdk.user = { id: 'account-b' };
    fixtures.sdk.session = { id: 'session-b', user: { id: 'account-b' } };
    expect(lifetime.isCurrent()).toBe(false);
    fixtures.sdk.user = originalUser;
    fixtures.sdk.session = originalSession;
    expect(lifetime.isCurrent()).toBe(false);
  });

  it('retires on same-account session replacement', () => {
    const { result } = renderHook(() => useReadonlyIdentityLifetime());
    const lifetime = result.current();
    fixtures.sdk.session = { id: 'session-a', user: { id: 'account-a' } };
    expect(lifetime.isCurrent()).toBe(false);
  });

  it('retires rendered identity changes even when SDK identity has not caught up', () => {
    const { result, rerender } = renderHook(() => useReadonlyIdentityLifetime());
    const lifetime = result.current();
    fixtures.auth = { ...fixtures.auth, sessionId: 'session-new' };
    rerender();
    expect(lifetime.isCurrent()).toBe(false);
  });
});

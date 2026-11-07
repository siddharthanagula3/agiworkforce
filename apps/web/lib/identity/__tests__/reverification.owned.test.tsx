import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority } from '../request-authority';
import { useSessionSnapshot } from '../useSessionSnapshot';
import { useSessionReverification } from '../client';

const fixture = vi.hoisted(() => {
  const native = (id: string) => ({
    id,
    user: { id: 'account-a' },
    getToken: vi.fn(async (_options?: { skipCache?: boolean }) => 'fake-fresh-token'),
    startVerification: vi.fn(async () => ({ status: 'complete' })),
    prepareFirstFactorVerification: vi.fn(async () => undefined),
    attemptFirstFactorVerification: vi.fn(async () => ({ status: 'complete' })),
    attemptSecondFactorVerification: vi.fn(async () => ({ status: 'complete' })),
    verifyWithPasskey: vi.fn(async () => ({ status: 'complete' })),
  });
  const listeners = new Set<() => void>();
  const session = native('session-a');
  return {
    native,
    listeners,
    providerSession: session,
    sdk: {
      loaded: true,
      user: { id: 'account-a' },
      session,
      addListener: (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    },
  };
});
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'account-a', sessionId: 'session-a' }),
  useClerk: () => fixture.sdk,
  useSession: () => ({ session: fixture.providerSession }),
  useSignUp: vi.fn(),
  useUser: vi.fn(),
}));

beforeEach(() => {
  fixture.listeners.clear();
  fixture.sdk.session = fixture.native('session-a');
  fixture.providerSession = fixture.sdk.session;
});

function owned() {
  const snapshot = renderHook(useSessionSnapshot).result.current()!;
  const authority = createRequestAuthority(snapshot);
  const unsubscribe = snapshot.subscribe?.(() => { authority.isCurrent(); });
  authority.signal.addEventListener('abort', () => unsubscribe?.(), { once: true });
  const result = renderHook(() => useSessionReverification(authority)).result;
  return { authority, result };
}

describe('native session bound reverification', () => {
  it('uses the captured native session, never a newer provider hook session', async () => {
    const original = fixture.sdk.session;
    fixture.providerSession = fixture.native('session-b');
    const { result, authority } = owned();
    await result.current.start('first_factor');
    await result.current.verifyPassword('fake-password');
    await result.current.freshToken();
    expect(original.startVerification).toHaveBeenCalledOnce();
    expect(original.attemptFirstFactorVerification).toHaveBeenCalledOnce();
    expect(original.getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(fixture.providerSession.startVerification).not.toHaveBeenCalled();
    expect(fixture.providerSession.getToken).not.toHaveBeenCalled();
    authority.retire();
  });

  it('retires the request immediately on native session observation', () => {
    const { authority } = owned();
    fixture.sdk.session = fixture.native('session-b');
    for (const listener of fixture.listeners) listener();
    expect(authority.signal.aborted).toBe(true);
    expect(fixture.listeners.size).toBe(0);
  });

  it('blocks every verification action after intent retirement', async () => {
    const original = fixture.sdk.session;
    const { authority, result } = owned();
    authority.retire();
    const actions = [
      () => result.current.start('first_factor'),
      () => result.current.sendEmailCode({ emailAddressId: 'email-a', destination: null }),
      () => result.current.verifyPassword('fake-password'),
      () => result.current.verifyEmailCode('fake-code'),
      () => result.current.verifyPasskey(),
      () => result.current.verifySecondFactor('authenticator', 'fake-code'),
      () => result.current.verifySecondFactor('backup_code', 'fake-code'),
      () => result.current.freshToken(),
    ];
    for (const action of actions) await expect(action()).rejects.toMatchObject({ name: 'AbortError' });
    for (const value of Object.values(original)) {
      if (vi.isMockFunction(value)) expect(value).not.toHaveBeenCalled();
    }
  });

  it('rejects verification completion after owner retirement', async () => {
    let finish!: (value: { status: string }) => void;
    fixture.sdk.session.attemptFirstFactorVerification.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { authority, result } = owned();
    const operation = result.current.verifyPassword('fake-password');
    authority.retire();
    finish({ status: 'complete' });
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  });
});


it('fails closed when an authority has no canonical native session binding', async () => {
  const authority = createRequestAuthority({ userId: 'account-a', sessionId: 'session-a', isCurrent: () => true, getToken: async () => 'fake-token' });
  const { result } = renderHook(() => useSessionReverification(authority));
  await expect(result.current.verifyPasskey()).rejects.toMatchObject({ name: 'AbortError' });
  expect(fixture.sdk.session.verifyWithPasskey).not.toHaveBeenCalled();
});

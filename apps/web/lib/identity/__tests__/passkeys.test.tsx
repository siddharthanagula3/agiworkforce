import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  isLoaded: true,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user-1',
    getToken: async () => null,
  }),
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ isLoaded: mocks.isLoaded, isSignedIn: true, user: mocks.user }),
}));
vi.mock('@agiworkforce/local-runtime-contract', () => ({ getHostBridge: () => null }));

import { browserSupportsPasskeys } from '../passkey-support';
import { usePasskeys } from '../client';

function passkey(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    name: `Key ${id}`,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    lastUsedAt: new Date('2026-09-01T00:00:00.000Z'),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function signedInWith(passkeys: ReturnType<typeof passkey>[]) {
  const reload = vi.fn(async () => undefined);
  const createPasskey = vi.fn(async () => undefined);
  mocks.user = { id: 'user-1', passkeys, reload, createPasskey };
  return { reload, createPasskey };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLoaded = true;
  mocks.user = null;
});

describe('the passkeys an account can sign in with', () => {
  it('reports none for an account that has not added one', () => {
    signedInWith([]);

    const { result } = renderHook(() => usePasskeys());

    expect(result.current.passkeys).toEqual([]);
    expect(result.current.isLoaded).toBe(true);
  });

  it('lists the name the person gave each key, with when it was made and last used', () => {
    signedInWith([passkey('pk_1'), passkey('pk_2', { name: null })]);

    const { result } = renderHook(() => usePasskeys());

    expect(result.current.passkeys).toEqual([
      {
        id: 'pk_1',
        name: 'Key pk_1',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        lastUsedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        id: 'pk_2',
        name: null,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        lastUsedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);
  });

  it('says a key has never been used rather than inventing a date for it', () => {
    signedInWith([passkey('pk_1', { lastUsedAt: null })]);

    const { result } = renderHook(() => usePasskeys());

    expect(result.current.passkeys[0]?.lastUsedAt).toBeNull();
  });

  it('adds a key through the platform authenticator and re-reads the account', async () => {
    const { createPasskey, reload } = signedInWith([]);
    const { result } = renderHook(() => usePasskeys());

    await act(async () => {
      await result.current.create();
    });

    expect(createPasskey).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refuses to add a key when the session has gone, instead of failing silently', async () => {
    mocks.user = null;
    const { result } = renderHook(() => usePasskeys());

    await expect(result.current.create()).rejects.toThrow(/Sign in again/);
  });

  it('removes the key that was named and leaves the others alone', async () => {
    const first = passkey('pk_1');
    const second = passkey('pk_2');
    const { reload } = signedInWith([first, second]);
    const { result } = renderHook(() => usePasskeys());

    await act(async () => {
      await result.current.remove('pk_2');
    });

    expect(second.delete).toHaveBeenCalledTimes(1);
    expect(first.delete).not.toHaveBeenCalled();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('does nothing for a key the account does not hold', async () => {
    const { reload } = signedInWith([passkey('pk_1')]);
    const { result } = renderHook(() => usePasskeys());

    await act(async () => {
      await result.current.remove('pk_missing');
    });

    expect(reload).not.toHaveBeenCalled();
  });

  it('waits for the account to load before saying the list is empty', () => {
    mocks.isLoaded = false;
    mocks.user = null;

    const { result } = renderHook(() => usePasskeys());

    expect(result.current.isLoaded).toBe(false);
  });
});

describe('whether this browser can hold a passkey at all', () => {
  it('says yes only when the platform exposes the credential API', () => {
    const original = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;

    (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = function () {};
    expect(browserSupportsPasskeys()).toBe(true);

    delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    expect(browserSupportsPasskeys()).toBe(false);

    (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = original;
  });

  it('gates the add control on that answer rather than offering what cannot work', () => {
    (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = undefined;
    signedInWith([]);

    const { result } = renderHook(() => usePasskeys());

    expect(result.current.isSupported).toBe(false);
  });
});

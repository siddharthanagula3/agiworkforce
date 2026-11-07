import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, passkeyFixture } from './passkey-fixture';
const mocks = vi.hoisted(() => ({ fixture: null as unknown, loaded: true, noUser: false }));
vi.mock('@clerk/nextjs', async () => ({
  ...(await vi.importActual<typeof import('@clerk/nextjs')>('@clerk/nextjs')),
  useUser: () => ({
    isLoaded: mocks.loaded,
    user: mocks.noUser ? null : (mocks.fixture as ReturnType<typeof passkeyFixture>).user,
  }),
  useClerk: () => (mocks.fixture as ReturnType<typeof passkeyFixture>).clerk,
}));
import { usePasskeys } from '../client';
import { browserSupportsPasskeys } from '../passkey-support';
let fixture: ReturnType<typeof passkeyFixture>;
beforeEach(() => {
  fixture = passkeyFixture();
  mocks.fixture = fixture;
  mocks.loaded = true;
  mocks.noUser = false;
});
afterEach(() => {
  fixture.request.retire();
  vi.unstubAllGlobals();
});
const hook = () => renderHook(() => usePasskeys());
describe('application-owned passkey boundaries', () => {
  it('maps dates, trimmed names and nullable last-used values without inventing data', () => {
    const created = new Date('2026-03-01T00:00:00Z');
    const lastUsed = new Date('2026-09-01T00:00:00Z');
    fixture.user.passkeys = [
      { ...fixture.key, name: '  Laptop  ', createdAt: created, lastUsedAt: lastUsed },
      { ...fixture.key, id: 'pk_2', name: null, lastUsedAt: null },
    ];
    const { result } = hook();
    expect(result.current.passkeys).toEqual([
      { id: 'pk_1', name: 'Laptop', createdAt: created, lastUsedAt: lastUsed },
      { id: 'pk_2', name: null, createdAt: fixture.key.createdAt, lastUsedAt: null },
    ]);
  });
  it('reports a loaded empty account without inventing passkeys', () => {
    fixture.user.passkeys = [];
    const { result } = hook();
    expect(result.current.isLoaded).toBe(true);
    expect(result.current.passkeys).toEqual([]);
  });
  it('withholds read admission while loading or without a current user', () => {
    mocks.loaded = false;
    const { result, rerender } = hook();
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.passkeys).toEqual([]);
    mocks.loaded = true;
    mocks.noUser = true;
    rerender();
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.passkeys).toEqual([]);
    expect(() => result.current.capture('create', fixture.scope)).toThrow(/account changed/);
    expect(fixture.user.createPasskey).not.toHaveBeenCalled();
  });
  it('reports positive and negative browser support in the hook and helper', () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    const { result, rerender } = hook();
    expect(browserSupportsPasskeys()).toBe(true);
    expect(result.current.isSupported).toBe(true);
    vi.stubGlobal('PublicKeyCredential', undefined);
    rerender();
    expect(browserSupportsPasskeys()).toBe(false);
    expect(result.current.isSupported).toBe(false);
  });
  it('mutates only the selected key and leaves the other key alone', async () => {
    const other = { ...fixture.key, id: 'pk_2', delete: vi.fn(async () => undefined) };
    fixture.user.passkeys.push(other);
    const { result } = hook();
    await result.current.capture('remove', fixture.scope, 'pk_2').execute();
    expect(other.delete).toHaveBeenCalledTimes(1);
    expect(fixture.key.delete).not.toHaveBeenCalled();
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
  });
  it('latches dispatch before invoking a reentrant dispatch callback', async () => {
    const { result } = hook();
    let nested: Promise<void> | undefined;
    const operation = result.current.capture('create', {
      authority: fixture.request,
      onDispatch: () => {
        nested = expect(operation.execute()).rejects.toThrow(/already started/);
      },
    });
    await operation.execute();
    await nested;
    expect(fixture.user.createPasskey).toHaveBeenCalledTimes(1);
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
  });
  it('releases a subscription that synchronously retires during initial observation', async () => {
    fixture.request.session.subscribe = (listener) => {
      const stop = fixture.clerk.addListener(listener);
      fixture.session.user = { ...fixture.user };
      listener();
      return stop;
    };
    const { result } = hook();
    const operation = result.current.capture('create', fixture.scope);
    await expect(operation.execute()).rejects.toThrow();
    expect(fixture.listeners.size).toBe(0);
    expect(fixture.user.createPasskey).not.toHaveBeenCalled();
    expect(fixture.scope.onDispatch).not.toHaveBeenCalled();
  });
  it('maps the current resource and withholds a mismatched read', () => {
    const { result, rerender } = hook();
    expect(result.current.passkeys[0]?.name).toBe('MacBook');
    fixture.clerk.user = { ...fixture.user };
    rerender();
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.passkeys).toEqual([]);
  });
  it('creates and reloads the captured user once', async () => {
    const { result } = hook();
    const operation = result.current.capture('create', fixture.scope);
    await operation.execute();
    await expect(operation.execute()).rejects.toThrow(/already started/);
    expect(fixture.user.createPasskey).toHaveBeenCalledTimes(1);
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
    expect(fixture.scope.onDispatch).toHaveBeenCalledTimes(1);
  });
  it('requires the exact target before dispatch and rejects missing targets', async () => {
    const { result } = hook();
    expect(() => result.current.capture('remove', fixture.scope, 'missing')).toThrow(/no longer/);
    const operation = result.current.capture('remove', fixture.scope, 'pk_1');
    fixture.user.passkeys = [{ ...fixture.key }];
    await expect(operation.execute()).rejects.toThrow(/no longer/);
    expect(fixture.key.delete).not.toHaveBeenCalled();
  });
  it('does not revive a target removed and restored during editor observation', async () => {
    const { result } = hook();
    const operation = result.current.capture('rename', fixture.scope, 'pk_1');
    fixture.user.passkeys = [];
    fixture.emit();
    fixture.user.passkeys = [fixture.key];
    fixture.emit();
    await expect(operation.execute('New')).rejects.toThrow();
    expect(fixture.key.update).not.toHaveBeenCalled();
  });
  it('permits successful deletion to remove the target before reload', async () => {
    fixture.key.delete.mockImplementation(async () => {
      fixture.user.passkeys = [];
      fixture.emit();
    });
    const { result } = hook();
    await result.current.capture('remove', fixture.scope, 'pk_1').execute();
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
  });
  it.each(['create', 'rename', 'remove'] as const)(
    'stops after retired %s dispatch',
    async (kind) => {
      const pending = deferred();
      if (kind === 'create') fixture.user.createPasskey.mockImplementation(() => pending.promise);
      if (kind === 'rename')
        fixture.key.update.mockImplementation(async () => {
          await pending.promise;
          return fixture.key;
        });
      if (kind === 'remove') fixture.key.delete.mockImplementation(() => pending.promise);
      const { result } = hook();
      const work = result.current.capture(kind, fixture.scope, 'pk_1').execute('New');
      const rejected = expect(work).rejects.toThrow();
      fixture.retire();
      pending.resolve();
      await rejected;
      expect(fixture.user.reload).not.toHaveBeenCalled();
    },
  );
  it('rejects settlement after session retirement during reload', async () => {
    const pending = deferred<typeof fixture.user>();
    fixture.user.reload.mockImplementation(() => pending.promise);
    const { result } = hook();
    const work = result.current.capture('create', fixture.scope).execute();
    const rejected = expect(work).rejects.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
    fixture.retire();
    pending.resolve(fixture.user);
    await rejected;
  });
  it('fails closed for native user replacement and wrong refresh owner', async () => {
    fixture.user.reload.mockImplementation(async () => ({ ...fixture.user, id: 'other' }));
    const { result } = hook();
    await expect(result.current.capture('create', fixture.scope).execute()).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fixture.request.signal.aborted).toBe(true);
    expect(fixture.user.createPasskey).toHaveBeenCalledTimes(1);
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
    expect(fixture.scope.onDispatch).toHaveBeenCalledTimes(1);
  });
  it('releases observation when retired', () => {
    const { result } = hook();
    result.current.capture('create', fixture.scope);
    expect(fixture.listeners.size).toBe(1);
    fixture.request.retire();
    expect(fixture.listeners.size).toBe(0);
  });
  it('reports browser capability without fabricating support', () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(browserSupportsPasskeys()).toBe(false);
    vi.unstubAllGlobals();
  });
});

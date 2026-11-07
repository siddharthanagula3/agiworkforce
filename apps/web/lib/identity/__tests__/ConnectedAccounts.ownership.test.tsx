import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority, type RequestAuthority } from '../request-authority';
import { useSessionSnapshot } from '../useSessionSnapshot';
import { UNCONFIRMED_EMAIL_CONNECT_MESSAGE, useConnectedAccounts } from '../client';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function accountFixture() {
  const target = {
    id: 'external-1',
    provider: 'google',
    emailAddress: '  owner@example.com  ',
    destroy: vi.fn(async (): Promise<void> => undefined),
  };
  const created = {
    verification: { externalVerificationRedirectURL: new URL('https://accounts.example/oauth') },
  };
  const user = {
    id: 'user-1',
    externalAccounts: [target],
    primaryEmailAddress: { verification: { status: 'verified' } },
    createExternalAccount: vi.fn(
      async (_options: { strategy: string; redirectUrl: string }) => created,
    ),
    reload: vi.fn(async (): Promise<{ id: string }> => ({ id: 'user-1' })),
  };
  const session = { id: 'session-1', user, getToken: vi.fn(async () => 'fixture-token') };
  const listeners = new Set<() => void>();
  const clerk = {
    loaded: true,
    user,
    session,
    addListener: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    target,
    created,
    user,
    session,
    clerk,
    listeners,
    emit: () => {
      for (const listener of [...listeners]) listener();
    },
  };
}

const mocks = vi.hoisted(() => ({ fixture: null as unknown, loaded: true }));
vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/nextjs')>()),
  useUser: () => ({
    isLoaded: mocks.loaded,
    user: (mocks.fixture as ReturnType<typeof accountFixture>).user,
  }),
  useClerk: () => (mocks.fixture as ReturnType<typeof accountFixture>).clerk,
  useAuth: () => ({
    isLoaded: mocks.loaded,
    isSignedIn: true,
    userId: 'user-1',
    sessionId: 'session-1',
  }),
}));

let fixture: ReturnType<typeof accountFixture>;
let requests: RequestAuthority[];
const assign = vi.fn();
const connect = {
  kind: 'connect',
  provider: 'google',
  returnUrl: 'https://agiworkforce.com/settings',
} as const;
const disconnect = { kind: 'disconnect', accountId: 'external-1' } as const;

function owned() {
  const { result, rerender } = renderHook(() => ({
    read: useSessionSnapshot(),
    accounts: useConnectedAccounts(),
  }));
  const snapshot = result.current.read();
  if (!snapshot) throw new Error('Fixture must start with a coherent native session');
  const authority = createRequestAuthority(snapshot);
  requests.push(authority);
  const scope = { authority, onDispatch: vi.fn() };
  return { result, rerender, authority, scope };
}

beforeEach(() => {
  fixture = accountFixture();
  mocks.fixture = fixture;
  mocks.loaded = true;
  requests = [];
  assign.mockClear();
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => {
  for (const request of requests) request.retire();
  vi.unstubAllGlobals();
});

describe('captured native connected-account ownership', () => {
  it('rereads externalAccounts mutated on the same user object', () => {
    const { result, rerender } = owned();
    expect(result.current.accounts.accounts).toEqual([
      { id: 'external-1', provider: 'google', email: 'owner@example.com' },
    ]);
    fixture.user.externalAccounts = [];
    rerender();
    expect(result.current.accounts.accounts).toEqual([]);
    fixture.user.externalAccounts.push({ ...fixture.target, id: 'external-2' });
    rerender();
    expect(result.current.accounts.accounts[0]?.id).toBe('external-2');
  });

  it('withholds accounts when native and rendered users disagree or loading resumes', () => {
    const { result, rerender, scope } = owned();
    fixture.clerk.user = { ...fixture.user };
    rerender();
    expect(result.current.accounts.isCurrent()).toBe(false);
    expect(result.current.accounts.isLoaded).toBe(false);
    expect(result.current.accounts.accounts).toEqual([]);
    expect(() => result.current.accounts.capture(connect, scope)).toThrow();
    fixture.clerk.user = fixture.user;
    mocks.loaded = false;
    rerender();
    expect(result.current.accounts.isLoaded).toBe(false);
    expect(result.current.accounts.accounts).toEqual([]);
  });

  it.each([
    'user id',
    'user reference',
    'session id',
    'session reference',
    'session user reference',
  ] as const)('rejects a changed %s before dispatch', async (change) => {
    const { result, scope } = owned();
    const operation = result.current.accounts.capture(disconnect, scope);
    if (change === 'user id') fixture.user.id = 'user-2';
    if (change === 'user reference') fixture.clerk.user = { ...fixture.user };
    if (change === 'session id') fixture.session.id = 'session-2';
    if (change === 'session reference') fixture.clerk.session = { ...fixture.session };
    if (change === 'session user reference') fixture.session.user = { ...fixture.user };
    await expect(operation.execute()).rejects.toThrow();
    expect(scope.onDispatch).not.toHaveBeenCalled();
    expect(fixture.target.destroy).not.toHaveBeenCalled();
  });

  it('rejects capture after the bound native user is replaced without a render', () => {
    const { result, scope } = owned();
    fixture.session.user = { ...fixture.user };
    expect(() => result.current.accounts.capture(connect, scope)).toThrow(/account changed/);
    expect(scope.onDispatch).not.toHaveBeenCalled();
    expect(fixture.user.createExternalAccount).not.toHaveBeenCalled();
  });

  it.each(['missing', 'duplicate'] as const)('rejects a %s target at capture', (change) => {
    const { result, scope } = owned();
    fixture.user.externalAccounts =
      change === 'missing' ? [] : [fixture.target, { ...fixture.target }];
    expect(() => result.current.accounts.capture(disconnect, scope)).toThrow(/no longer/);
    expect(fixture.target.destroy).not.toHaveBeenCalled();
  });

  it.each(['removed', 'same-id replacement', 'id mutated', 'duplicate'] as const)(
    'rejects a target %s while confirmation is pending',
    async (change) => {
      const { result, scope, authority } = owned();
      const operation = result.current.accounts.capture(disconnect, scope);
      const replacement = { ...fixture.target, destroy: vi.fn(async () => undefined) };
      if (change === 'removed') fixture.user.externalAccounts = [];
      if (change === 'same-id replacement') fixture.user.externalAccounts = [replacement];
      if (change === 'id mutated') fixture.target.id = 'external-2';
      if (change === 'duplicate') fixture.user.externalAccounts.push(replacement);
      await expect(operation.execute()).rejects.toThrow();
      expect(authority.signal.aborted).toBe(true);
      expect(scope.onDispatch).not.toHaveBeenCalled();
      expect(fixture.target.destroy).not.toHaveBeenCalled();
      expect(replacement.destroy).not.toHaveBeenCalled();
    },
  );

  it.each(['user', 'session', 'target'] as const)(
    'does not revive observed %s ABA replacement',
    async (change) => {
      const { result, scope, authority } = owned();
      const operation = result.current.accounts.capture(disconnect, scope);
      if (change === 'user') fixture.clerk.user = { ...fixture.user };
      if (change === 'session') fixture.clerk.session = { ...fixture.session };
      if (change === 'target') fixture.user.externalAccounts = [{ ...fixture.target }];
      fixture.emit();
      fixture.clerk.user = fixture.user;
      fixture.clerk.session = fixture.session;
      fixture.user.externalAccounts = [fixture.target];
      fixture.emit();
      expect(operation.isCurrent()).toBe(false);
      expect(authority.signal.aborted).toBe(true);
      await expect(operation.execute()).rejects.toThrow();
      expect(fixture.target.destroy).not.toHaveBeenCalled();
    },
  );

  it('rechecks primary-email verification at execution before dispatch', async () => {
    const { result, scope } = owned();
    const operation = result.current.accounts.capture(connect, scope);
    fixture.user.primaryEmailAddress.verification.status = 'unverified';
    await expect(operation.execute()).rejects.toThrow(UNCONFIRMED_EMAIL_CONNECT_MESSAGE);
    expect(scope.onDispatch).not.toHaveBeenCalled();
    expect(fixture.user.createExternalAccount).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('connects the captured selection once and redirects only while current', async () => {
    const { result, scope } = owned();
    const selection = { ...connect, returnUrl: String(connect.returnUrl) };
    const operation = result.current.accounts.capture(selection, scope);
    selection.returnUrl = 'https://agiworkforce.com/changed';
    await operation.execute();
    await expect(operation.execute()).rejects.toThrow(/already started/);
    expect(fixture.user.createExternalAccount).toHaveBeenCalledTimes(1);
    expect(fixture.user.createExternalAccount).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: connect.returnUrl,
    });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('https://accounts.example/oauth');
    expect(scope.onDispatch).toHaveBeenCalledTimes(1);
  });

  it('latches dispatch before a reentrant callback', async () => {
    const { result, authority } = owned();
    let nested: Promise<unknown> | undefined;
    const operation = result.current.accounts.capture(connect, {
      authority,
      onDispatch: () => {
        nested = expect(operation.execute()).rejects.toThrow(/already started/);
      },
    });
    await operation.execute();
    await nested;
    expect(fixture.user.createExternalAccount).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('checks retirement in the dispatch callback before calling the SDK', async () => {
    const { result, authority } = owned();
    const operation = result.current.accounts.capture(connect, {
      authority,
      onDispatch: () => authority.retire(),
    });
    await expect(operation.execute()).rejects.toThrow();
    expect(fixture.user.createExternalAccount).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'never redirects after delayed create %s for a retired session',
    async (settlement) => {
      const pending = deferred<typeof fixture.created>();
      fixture.user.createExternalAccount.mockImplementation(() => pending.promise);
      const { result, scope, authority } = owned();
      const work = result.current.accounts.capture(connect, scope).execute();
      const rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
      fixture.clerk.session = { ...fixture.session };
      fixture.emit();
      if (settlement === 'resolve') pending.resolve(fixture.created);
      else pending.reject(new Error('Provider unavailable'));
      await rejected;
      expect(authority.signal.aborted).toBe(true);
      expect(assign).not.toHaveBeenCalled();
      expect(fixture.user.reload).not.toHaveBeenCalled();
    },
  );

  it('disconnects only the chosen resource once and permits its removal before reload', async () => {
    const other = { ...fixture.target, id: 'external-2', destroy: vi.fn(async () => undefined) };
    fixture.user.externalAccounts.push(other);
    fixture.target.destroy.mockImplementation(async () => {
      fixture.user.externalAccounts = [other];
      fixture.emit();
    });
    const { result, scope } = owned();
    const operation = result.current.accounts.capture(disconnect, scope);
    await operation.execute();
    await expect(operation.execute()).rejects.toThrow(/already started/);
    expect(fixture.target.destroy).toHaveBeenCalledTimes(1);
    expect(other.destroy).not.toHaveBeenCalled();
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
    expect(scope.onDispatch).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'does not reload after delayed destroy %s for a replaced owner',
    async (settlement) => {
      const pending = deferred<void>();
      fixture.target.destroy.mockImplementation(() => pending.promise);
      const { result, scope } = owned();
      const work = result.current.accounts.capture(disconnect, scope).execute();
      const rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
      const replacement = { ...fixture.user, reload: vi.fn(async () => ({ id: 'user-1' })) };
      fixture.clerk.user = replacement;
      fixture.session.user = replacement;
      fixture.emit();
      if (settlement === 'resolve') pending.resolve();
      else pending.reject(new Error('Destroy failed'));
      await rejected;
      expect(fixture.user.reload).not.toHaveBeenCalled();
      expect(replacement.reload).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'destroy'] as const)(
    'retires a silently replaced owner in the delayed %s rejection fence',
    async (kind) => {
      const pending = deferred<void>();
      if (kind === 'create') {
        fixture.user.createExternalAccount.mockImplementation(async () => {
          await pending.promise;
          return fixture.created;
        });
      } else fixture.target.destroy.mockImplementation(() => pending.promise);
      const { result, scope, authority } = owned();
      const work = result.current.accounts
        .capture(kind === 'create' ? connect : disconnect, scope)
        .execute();
      const rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
      const replacement = { ...fixture.user, reload: vi.fn(async () => ({ id: 'user-1' })) };
      fixture.clerk.user = replacement;
      expect(authority.signal.aborted).toBe(false);
      expect(scope.onDispatch).toHaveBeenCalledTimes(1);
      pending.reject(new Error('Stale provider failure'));
      await rejected;
      expect(authority.signal.aborted).toBe(true);
      expect(fixture.listeners.size).toBe(0);
      expect(fixture.user.reload).not.toHaveBeenCalled();
      expect(replacement.reload).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'destroy'] as const)(
    'preserves the original delayed %s error while the native owner remains current',
    async (kind) => {
      const pending = deferred<void>();
      if (kind === 'create') {
        fixture.user.createExternalAccount.mockImplementation(async () => {
          await pending.promise;
          return fixture.created;
        });
      } else fixture.target.destroy.mockImplementation(() => pending.promise);
      const { result, scope, authority } = owned();
      const operation = result.current.accounts.capture(
        kind === 'create' ? connect : disconnect,
        scope,
      );
      const failure = new Error('Current provider failure');
      const rejected = expect(operation.execute()).rejects.toBe(failure);
      pending.reject(failure);
      await rejected;
      expect(authority.signal.aborted).toBe(false);
      expect(operation.isCurrent()).toBe(true);
      expect(scope.onDispatch).toHaveBeenCalledTimes(1);
      expect(fixture.user.reload).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it.each(['mismatch', 'replacement', 'retirement', 'rejection'] as const)(
    'rejects delayed reload %s instead of reporting success',
    async (change) => {
      const pending = deferred<{ id: string }>();
      fixture.user.reload.mockImplementation(() => pending.promise);
      const { result, scope, authority } = owned();
      const work = result.current.accounts.capture(disconnect, scope).execute();
      const rejected = expect(work).rejects.toThrow();
      await act(async () => {
        await Promise.resolve();
      });
      expect(fixture.user.reload).toHaveBeenCalledTimes(1);
      if (change === 'replacement') {
        fixture.clerk.user = { ...fixture.user };
        fixture.emit();
      }
      if (change === 'retirement') authority.retire();
      if (change === 'rejection') pending.reject(new Error('Reload failed'));
      else pending.resolve({ id: change === 'mismatch' ? 'user-2' : 'user-1' });
      await rejected;
      expect(fixture.target.destroy).toHaveBeenCalledTimes(1);
      expect(scope.onDispatch).toHaveBeenCalledTimes(1);
      expect(assign).not.toHaveBeenCalled();
    },
  );
});

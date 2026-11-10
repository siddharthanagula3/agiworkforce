const mockUnregisterPushToken = jest.fn();

jest.mock('@/src/features/auth/services/signOutPushTokenCleanup', () => ({
  PushTokenCleanupCredentialRejectedError: class PushTokenCleanupCredentialRejectedError extends Error {
    constructor(mockStatus: number) {
      super(`rejected ${mockStatus}`);
    }
  },
  unregisterPushTokenForSignOut: (token: string) => mockUnregisterPushToken(token),
}));

import { PushTokenCleanupCredentialRejectedError } from '@/src/features/auth/services/signOutPushTokenCleanup';
import {
  __resetPushTokenAccountLifecycleForTests,
  beginPushTokenAccountSession,
  clearPushTokenAccountSession,
} from '../src/features/auth/services/pushTokenAccountLifecycle';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('push-token account lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPushTokenAccountLifecycleForTests();
    mockUnregisterPushToken.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __resetPushTokenAccountLifecycleForTests();
  });

  it('waits for account A DELETE before it permits account B registration', async () => {
    const accountA = await beginPushTokenAccountSession('account-a', async () => 'jwt-a');
    expect(accountA).not.toBeNull();

    const deleteAccountA = deferred<void>();
    const deleteStarted = deferred<void>();
    mockUnregisterPushToken.mockImplementationOnce(() => {
      deleteStarted.resolve();
      return deleteAccountA.promise;
    });

    let accountBReady = false;
    const accountBPromise = beginPushTokenAccountSession('account-b', async () => 'jwt-b').then(
      (context) => {
        accountBReady = true;
        return context;
      },
    );

    await deleteStarted.promise;

    expect(mockUnregisterPushToken).toHaveBeenCalledWith('jwt-a');
    expect(accountA?.isCurrent()).toBe(false);
    expect(accountA?.signal.aborted).toBe(true);
    expect(accountBReady).toBe(false);

    deleteAccountA.resolve();
    const accountB = await accountBPromise;

    expect(accountB?.ownerId).toBe('account-b');
    expect(accountB?.isCurrent()).toBe(true);
    await expect(accountB?.getAuthToken()).resolves.toBe('jwt-b');
  });

  it('drops a token callback that resolves after its Clerk owner changed', async () => {
    const staleRefresh = deferred<string | null>();
    const getAccountAToken = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce('jwt-a')
      .mockReturnValueOnce(staleRefresh.promise);
    const accountA = await beginPushTokenAccountSession('account-a', getAccountAToken);
    expect(accountA).not.toBeNull();
    const pendingRefresh = accountA!.getAuthToken();

    await beginPushTokenAccountSession('account-b', async () => 'jwt-b');
    staleRefresh.resolve('fresh-jwt-a');

    await expect(pendingRefresh).resolves.toBeNull();
  });

  it('uses the cached owner credential when clearing the active account', async () => {
    const accountA = await beginPushTokenAccountSession('account-a', async () => 'jwt-a');

    await clearPushTokenAccountSession();

    expect(mockUnregisterPushToken).toHaveBeenCalledTimes(1);
    expect(mockUnregisterPushToken).toHaveBeenCalledWith('jwt-a');
    expect(accountA?.isCurrent()).toBe(false);
    expect(accountA?.signal.aborted).toBe(true);
  });

  it('lets the same account register again after a session whose credential was never captured', async () => {
    await expect(beginPushTokenAccountSession('account-a', async () => null)).resolves.toBeNull();

    await expect(clearPushTokenAccountSession()).resolves.toBeUndefined();
    expect(mockUnregisterPushToken).not.toHaveBeenCalled();

    const again = await beginPushTokenAccountSession('account-a', async () => 'jwt-a');
    expect(again?.ownerId).toBe('account-a');
    expect(again?.isCurrent()).toBe(true);
  });

  it('does not block the next account behind a session whose credential mint failed', async () => {
    await beginPushTokenAccountSession('account-a', async () => {
      throw new Error('mint failed');
    });

    const accountB = await beginPushTokenAccountSession('account-b', async () => 'jwt-b');

    expect(mockUnregisterPushToken).not.toHaveBeenCalled();
    expect(accountB?.ownerId).toBe('account-b');
  });

  it('cleans up a registered session with its credential when a same-account rebind could not capture one', async () => {
    const registered = await beginPushTokenAccountSession('account-a', async () => 'jwt-a0');
    expect(registered).not.toBeNull();
    await expect(beginPushTokenAccountSession('account-a', async () => null)).resolves.toBeNull();

    await clearPushTokenAccountSession();

    expect(mockUnregisterPushToken).toHaveBeenCalledTimes(1);
    expect(mockUnregisterPushToken).toHaveBeenCalledWith('jwt-a0');
  });

  it('keeps a failed DELETE at the head and retries it before the next account registers', async () => {
    await beginPushTokenAccountSession('account-a', async () => 'jwt-a');
    mockUnregisterPushToken.mockRejectedValueOnce(new Error('offline'));

    await expect(clearPushTokenAccountSession()).rejects.toThrow('offline');

    const accountB = await beginPushTokenAccountSession('account-b', async () => 'jwt-b');

    expect(mockUnregisterPushToken).toHaveBeenCalledTimes(2);
    expect(mockUnregisterPushToken).toHaveBeenLastCalledWith('jwt-a');
    expect(accountB?.ownerId).toBe('account-b');
  });

  it('settles cleanup when the server rejects the stored credential for good, so a later sign-in registers again', async () => {
    await beginPushTokenAccountSession('account-a', async () => 'expired-jwt-a');
    mockUnregisterPushToken.mockRejectedValueOnce(new PushTokenCleanupCredentialRejectedError(401));

    await expect(clearPushTokenAccountSession()).resolves.toBeUndefined();

    const again = await beginPushTokenAccountSession('account-a', async () => 'jwt-a2');
    expect(again?.ownerId).toBe('account-a');
    const accountB = await beginPushTokenAccountSession('account-b', async () => 'jwt-b');

    expect(mockUnregisterPushToken.mock.calls).toEqual([['expired-jwt-a'], ['jwt-a2']]);
    expect(again?.isCurrent()).toBe(false);
    expect(accountB?.ownerId).toBe('account-b');
    expect(accountB?.isCurrent()).toBe(true);
  });

  it('lets the next account in after a rejected credential but still retries a transient failure', async () => {
    await beginPushTokenAccountSession('account-a', async () => 'expired-jwt-a');
    mockUnregisterPushToken.mockRejectedValueOnce(new PushTokenCleanupCredentialRejectedError(401));

    const accountB = await beginPushTokenAccountSession('account-b', async () => 'jwt-b');
    expect(accountB?.ownerId).toBe('account-b');

    mockUnregisterPushToken.mockRejectedValueOnce(new Error('HTTP 503'));
    await expect(clearPushTokenAccountSession()).rejects.toThrow('HTTP 503');

    const accountC = await beginPushTokenAccountSession('account-c', async () => 'jwt-c');

    expect(mockUnregisterPushToken.mock.calls).toEqual([['expired-jwt-a'], ['jwt-b'], ['jwt-b']]);
    expect(accountC?.ownerId).toBe('account-c');
  });
});

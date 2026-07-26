const mockUnregisterPushToken = jest.fn();

jest.mock('@/src/features/auth/services/signOutPushTokenCleanup', () => ({
  unregisterPushTokenForSignOut: (token: string) => mockUnregisterPushToken(token),
}));

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
});

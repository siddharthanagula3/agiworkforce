/* eslint-disable @typescript-eslint/no-require-imports */
const mockStorage = new Map<string, unknown>();
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getBoolean: (key: string) => mockStorage.get(key) as boolean | undefined,
    getString: (key: string) => mockStorage.get(key) as string | undefined,
    set: (key: string, value: unknown) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));
jest.mock('@/lib/deviceId', () => ({ getDeviceId: jest.fn().mockResolvedValue('install-12345') }));
jest.mock('@/lib/constants', () => ({
  API_URL: 'https://example.test',
  TIMEOUTS: { SIGN_OUT_CLEANUP: 1_000 },
}));
jest.mock('@/services/api', () => ({ api: { post: mockPost, delete: mockDelete } }));
jest.mock('@/services/secureFetch', () => ({ secureFetch: jest.fn() }));
jest.mock('@/src/features/chat/store/appModeStore', () => {
  let state = { appMode: 'cloud' };
  const listeners = new Set<(next: typeof state, previous: typeof state) => void>();
  return {
    useChatAppModeStore: {
      getState: () => state,
      setState: (next: typeof state) => {
        const previous = state;
        state = next;
        listeners.forEach((listener) => listener(state, previous));
      },
      subscribe: (listener: (next: typeof state, previous: typeof state) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
});
jest.mock('@/src/features/billing/store', () => ({
  useTierStore: { getState: () => ({ tier: 'free' }) },
}));
jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: { getState: () => ({ selectedModel: 'auto' }) },
}));
jest.mock('@/src/features/chat/utils/newConversationModel', () => ({
  resolveNewConversationModel: () => 'auto',
}));

const TOKEN_A = {
  token: `agi_it_${'a'.repeat(43)}`,
  tokenId: '11111111-1111-4111-8111-111111111111',
};
const TOKEN_B = {
  token: `agi_it_${'b'.repeat(43)}`,
  tokenId: '22222222-2222-4222-8222-222222222222',
};

function loadContext() {
  let context:
    | {
        siri: typeof import('../src/features/siri/askIntentToken');
        account: typeof import('../src/features/auth/services/cloudAccountSession');
        secureStore: typeof import('expo-secure-store');
        mode: typeof import('../src/features/chat/store/appModeStore').useChatAppModeStore;
      }
    | undefined;
  jest.isolateModules(() => {
    const account = require('@/src/features/auth/services/cloudAccountSession');
    account.__resetCloudAccountSessionForTests();
    account.activateCloudAccount('account-a');
    context = {
      siri: require('../src/features/siri/askIntentToken'),
      account,
      secureStore: require('expo-secure-store'),
      mode: require('@/src/features/chat/store/appModeStore').useChatAppModeStore,
    };
    jest.mocked(context.secureStore.setItemAsync).mockReset().mockResolvedValue(undefined);
    jest.mocked(context.secureStore.deleteItemAsync).mockReset().mockResolvedValue(undefined);
  });
  return context!;
}

function load(): typeof import('../src/features/siri/askIntentToken') {
  return loadContext().siri;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function deferIssue() {
  const issue = deferred<typeof TOKEN_A>();
  const started = deferred<void>();
  mockPost.mockImplementationOnce(() => {
    started.resolve(undefined);
    return issue.promise;
  });
  return { ...issue, started: started.promise };
}

beforeEach(() => {
  mockStorage.clear();
  mockPost.mockReset();
  mockDelete.mockReset();
});

describe('Ask from Siri automatic rotation retry', () => {
  beforeEach(() => {
    mockStorage.set('ask-from-siri-enabled-v1', true);
  });

  it.each(['HTTP 429', 'HTTP 503', 'offline'])(
    'allows the next accepted heartbeat to retry after %s',
    async (message) => {
      const { siri } = loadContext();
      mockPost.mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce(TOKEN_A);

      await expect(siri.settleAskIntentOnLaunch()).rejects.toThrow(message);
      await siri.settleAskIntentOnLaunch();
      await siri.settleAskIntentOnLaunch();

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockStorage.get('ask-from-siri-token-id-v1')).toBe(TOKEN_A.tokenId);
    },
  );

  it('deduplicates simultaneous heartbeats while token issuance is pending', async () => {
    const { siri } = loadContext();
    const issue = deferIssue();

    const first = siri.settleAskIntentOnLaunch();
    await issue.started;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(1);
    issue.resolve(TOKEN_A);
    await first;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('keeps successful rotation deduplicated for later heartbeats', async () => {
    const { siri, secureStore } = loadContext();
    mockPost.mockResolvedValueOnce(TOKEN_A);

    await siri.settleAskIntentOnLaunch();
    await siri.settleAskIntentOnLaunch();

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it('retries after native token publication fails without overlapping publication', async () => {
    const { siri, secureStore } = loadContext();
    const publication = deferred<void>();
    const publicationStarted = deferred<void>();
    mockPost.mockResolvedValueOnce(TOKEN_A).mockResolvedValueOnce(TOKEN_B);
    jest.mocked(secureStore.setItemAsync).mockImplementationOnce(() => {
      publicationStarted.resolve(undefined);
      return publication.promise;
    });

    const first = siri.settleAskIntentOnLaunch();
    const failure = expect(first).rejects.toThrow('keychain unavailable');
    await publicationStarted.promise;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(1);
    publication.reject(new Error('keychain unavailable'));
    await failure;
    await siri.settleAskIntentOnLaunch();

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(2);
    expect(mockStorage.get('ask-from-siri-token-id-v1')).toBe(TOKEN_B.tokenId);
  });

  it('leaves the explicit sign-out reset intact when an old attempt fails later', async () => {
    const { siri, account } = loadContext();
    const issue = deferIssue();
    mockPost.mockResolvedValueOnce(TOKEN_B);
    const first = siri.settleAskIntentOnLaunch();
    const failure = expect(first).rejects.toThrow('old failure');
    await issue.started;
    account.invalidateCloudAccount();
    await siri.revokeAskIntentForSignOut('');

    issue.reject(new Error('old failure'));
    await failure;
    expect(siri.isAskFromSiriEnabled()).toBe(false);
    account.activateCloudAccount('account-b');
    mockStorage.set('ask-from-siri-enabled-v1', true);
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('does not let a retired attempt rearm or clear its same-account replacement', async () => {
    const { siri } = loadContext();
    const oldIssue = deferIssue();
    const newIssue = deferIssue();
    mockPost.mockResolvedValueOnce(TOKEN_B);
    const first = siri.settleAskIntentOnLaunch();
    const oldFailure = expect(first).rejects.toThrow('old failure');
    await oldIssue.started;
    await siri.revokeAskIntentForSignOut('');
    mockStorage.set('ask-from-siri-enabled-v1', true);
    const replacement = siri.settleAskIntentOnLaunch();
    const replacementFailure = expect(replacement).rejects.toThrow('replacement failure');

    oldIssue.reject(new Error('old failure'));
    await oldFailure;
    await newIssue.started;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(2);

    newIssue.reject(new Error('replacement failure'));
    await replacementFailure;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(3);
  });

  it.each(['account-b', 'account-a'])(
    'allows the current epoch to rotate after retiring %s',
    async (ownerId) => {
      const { siri, account } = loadContext();
      const issue = deferIssue();
      mockPost.mockResolvedValueOnce(TOKEN_B);
      const first = siri.settleAskIntentOnLaunch();
      const failure = expect(first).rejects.toThrow('stale failure');
      await issue.started;
      account.invalidateCloudAccount();
      account.activateCloudAccount(ownerId);

      issue.reject(new Error('stale failure'));
      await failure;
      await siri.settleAskIntentOnLaunch();
      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockStorage.get('ask-from-siri-token-id-v1')).toBe(TOKEN_B.tokenId);
    },
  );
});

describe('Ask from Siri token revocation', () => {
  it('a failed disable followed by a re-enable never revokes the new token on the next launch', async () => {
    const siri = load();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    await siri.enableAskFromSiri();

    mockDelete.mockRejectedValueOnce(new Error('offline'));
    await expect(siri.disableAskFromSiri()).rejects.toThrow('offline');
    expect(mockDelete).toHaveBeenCalledWith(`/api/mobile/intent-token?tokenId=${TOKEN_A.tokenId}`, {
      accountEpoch: expect.objectContaining({ ownerId: 'account-a' }),
    });

    mockPost.mockResolvedValueOnce(TOKEN_B);
    await siri.enableAskFromSiri();
    mockDelete.mockClear();

    const nextLaunch = load();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    await nextLaunch.settleAskIntentOnLaunch();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(nextLaunch.isAskFromSiriEnabled()).toBe(true);
  });

  it('retries a failed disable on the next launch, scoped to the old token', async () => {
    const siri = load();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    await siri.enableAskFromSiri();
    mockDelete.mockRejectedValueOnce(new Error('offline'));
    await expect(siri.disableAskFromSiri()).rejects.toThrow('offline');

    mockDelete.mockResolvedValueOnce({ revoked: true });
    await load().settleAskIntentOnLaunch();
    expect(mockDelete).toHaveBeenLastCalledWith(
      `/api/mobile/intent-token?tokenId=${TOKEN_A.tokenId}`,
      { accountEpoch: expect.objectContaining({ ownerId: 'account-a' }) },
    );

    mockDelete.mockClear();
    await load().settleAskIntentOnLaunch();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('Ask from Siri ordinary-operation ownership', () => {
  it('retries rotation in the current mode lifetime after a retired response', async () => {
    const { siri, mode, secureStore } = loadContext();
    mockStorage.set('ask-from-siri-enabled-v1', true);
    const issue = deferIssue();
    mockPost.mockResolvedValueOnce(TOKEN_B);
    const oldRotation = siri.settleAskIntentOnLaunch();
    const failure = expect(oldRotation).rejects.toThrow('account or mode changed');
    await issue.started;
    mode.setState({ appMode: 'local' });
    mode.setState({ appMode: 'cloud' });
    const replacement = siri.settleAskIntentOnLaunch();
    issue.resolve(TOKEN_A);
    await failure;
    await replacement;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(mockStorage.get('ask-from-siri-token-id-v1')).toBe(TOKEN_B.tokenId);
  });

  it('disables the token published by an earlier pending heartbeat rotation', async () => {
    const { siri, secureStore, account } = loadContext();
    mockStorage.set('ask-from-siri-enabled-v1', true);
    mockStorage.set('ask-from-siri-token-id-v1', TOKEN_A.tokenId);
    const issue = deferIssue();
    mockDelete.mockResolvedValue({ revoked: true });

    const rotation = siri.settleAskIntentOnLaunch();
    await issue.started;
    const disable = siri.disableAskFromSiri();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    issue.resolve(TOKEN_B);
    await rotation;
    await disable;

    expect(mockPost).toHaveBeenCalledWith(
      '/api/mobile/intent-token',
      { installId: 'install-12345', defaultModelId: 'auto' },
      { accountEpoch: account.captureCloudAccountEpoch() },
    );
    expect(mockDelete).toHaveBeenCalledWith(`/api/mobile/intent-token?tokenId=${TOKEN_B.tokenId}`, {
      accountEpoch: account.captureCloudAccountEpoch(),
    });
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(siri.isAskFromSiriEnabled()).toBe(false);
    expect(mockStorage.has('ask-from-siri-token-id-v1')).toBe(false);
  });

  it('waits for admitted native publication before selecting the disable target', async () => {
    const { siri, secureStore } = loadContext();
    mockStorage.set('ask-from-siri-enabled-v1', true);
    const publication = deferred<void>();
    const started = deferred<void>();
    mockPost.mockResolvedValue(TOKEN_B);
    mockDelete.mockResolvedValue({ revoked: true });
    jest.mocked(secureStore.setItemAsync).mockImplementationOnce(() => {
      started.resolve(undefined);
      return publication.promise;
    });

    const rotation = siri.settleAskIntentOnLaunch();
    await started.promise;
    const disable = siri.disableAskFromSiri();
    expect(mockDelete).not.toHaveBeenCalled();
    publication.resolve(undefined);
    await rotation;
    await disable;
    expect(mockDelete).toHaveBeenCalledWith(`/api/mobile/intent-token?tokenId=${TOKEN_B.tokenId}`, {
      accountEpoch: expect.objectContaining({ ownerId: 'account-a' }),
    });
  });

  it('rechecks enabled after a preceding disable instead of issuing a queued rotation', async () => {
    const { siri } = loadContext();
    mockStorage.set('ask-from-siri-enabled-v1', true);
    mockStorage.set('ask-from-siri-token-id-v1', TOKEN_A.tokenId);
    const revoke = deferred<{ revoked: boolean }>();
    const started = deferred<void>();
    mockDelete.mockImplementationOnce(() => {
      started.resolve(undefined);
      return revoke.promise;
    });
    const disable = siri.disableAskFromSiri();
    await started.promise;
    const rotation = siri.settleAskIntentOnLaunch();
    revoke.resolve({ revoked: true });
    await disable;
    await rotation;
    expect(mockPost).not.toHaveBeenCalled();
    expect(siri.isAskFromSiriEnabled()).toBe(false);
  });

  it.each(['account', 'mode'])(
    'rejects queued and returned work after a %s round trip',
    async (kind) => {
      const { siri, account, mode, secureStore } = loadContext();
      const issue = deferIssue();
      const enable = siri.enableAskFromSiri();
      const enableFailure = expect(enable).rejects.toThrow('account or mode changed');
      await issue.started;
      const disable = siri.disableAskFromSiri();
      const disableFailure = expect(disable).rejects.toThrow('account or mode changed');
      if (kind === 'account') {
        account.invalidateCloudAccount();
        account.activateCloudAccount('account-a');
      } else {
        mode.setState({ appMode: 'local' });
        mode.setState({ appMode: 'cloud' });
      }
      mockStorage.set('ask-from-siri-token-id-v1', TOKEN_B.tokenId);
      issue.resolve(TOKEN_A);
      await enableFailure;
      await disableFailure;
      expect(mockDelete).not.toHaveBeenCalled();
      expect(secureStore.setItemAsync).not.toHaveBeenCalled();
      expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
      expect(mockStorage.get('ask-from-siri-token-id-v1')).toBe(TOKEN_B.tokenId);
    },
  );

  it.each([true, false])(
    'clears a Local token after refusal with account present = %s',
    async (signedIn) => {
      const { siri, account, mode, secureStore } = loadContext();
      mode.setState({ appMode: 'local' });
      if (!signedIn) account.invalidateCloudAccount();
      mockStorage.set('ask-from-siri-enabled-v1', true);
      mockStorage.set('ask-from-siri-token-id-v1', TOKEN_A.tokenId);
      mockDelete.mockRejectedValue(new Error('Cloud egress refused'));
      await expect(siri.disableAskFromSiri()).rejects.toThrow('Cloud egress refused');
      expect(siri.isAskFromSiriEnabled()).toBe(false);
      expect(mockStorage.has('ask-from-siri-token-id-v1')).toBe(false);
      expect(mockStorage.get('ask-from-siri-pending-revoke-token-v1')).toBe(TOKEN_A.tokenId);
      expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    },
  );

  it('retires no-account Local cleanup across an account round trip', async () => {
    const { siri, account, mode, secureStore } = loadContext();
    mode.setState({ appMode: 'local' });
    account.invalidateCloudAccount();
    const revoke = deferred<{ revoked: boolean }>();
    const started = deferred<void>();
    mockDelete.mockImplementationOnce(() => {
      started.resolve(undefined);
      return revoke.promise;
    });
    const first = siri.disableAskFromSiri();
    const firstFailure = expect(first).rejects.toThrow('account or mode changed');
    await started.promise;
    const queued = siri.disableAskFromSiri();
    const queuedFailure = expect(queued).rejects.toThrow('account or mode changed');
    account.activateCloudAccount('account-b');
    account.invalidateCloudAccount();
    mockStorage.set('ask-from-siri-token-id-v1', TOKEN_B.tokenId);
    revoke.resolve({ revoked: true });
    await firstFailure;
    await queuedFailure;
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(mockStorage.get('ask-from-siri-token-id-v1')).toBe(TOKEN_B.tokenId);
  });

  it('does not hold sign-out behind pending ordinary network work', async () => {
    const { siri, secureStore } = loadContext();
    const issue = deferIssue();
    const enable = siri.enableAskFromSiri();
    const enableFailure = expect(enable).rejects.toThrow('account or mode changed');
    await issue.started;
    const disable = siri.disableAskFromSiri();
    const disableFailure = expect(disable).rejects.toThrow('account or mode changed');
    await siri.revokeAskIntentForSignOut('');
    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    issue.resolve(TOKEN_A);
    await enableFailure;
    await disableFailure;
    expect(mockDelete).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
  });

  it('does not let a retired pending-revoke result clear replacement markers', async () => {
    const { siri, account } = loadContext();
    mockStorage.set('ask-from-siri-pending-revoke-token-v1', TOKEN_A.tokenId);
    const revoke = deferred<{ revoked: boolean }>();
    const started = deferred<void>();
    mockDelete.mockImplementationOnce(() => {
      started.resolve(undefined);
      return revoke.promise;
    });
    const settle = siri.settleAskIntentOnLaunch();
    const failure = expect(settle).rejects.toThrow('account or mode changed');
    await started.promise;
    account.invalidateCloudAccount();
    account.activateCloudAccount('account-b');
    mockStorage.set('ask-from-siri-pending-revoke-token-v1', TOKEN_B.tokenId);
    revoke.resolve({ revoked: true });
    await failure;
    expect(mockStorage.get('ask-from-siri-pending-revoke-token-v1')).toBe(TOKEN_B.tokenId);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

/* eslint-disable @typescript-eslint/no-require-imports */
const mockStorage = new Map<string, unknown>();
const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockEnsureCloudSendConsent = jest.fn();
type MockAppModeState = { appMode: string };
type MockAppModeListener = (next: MockAppModeState, previous: MockAppModeState) => void;

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
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
jest.mock('@/services/llmGate', () => ({
  ensureCloudSendConsent: () => mockEnsureCloudSendConsent(),
}));
jest.mock('@/src/features/chat/store/appModeStore', () => {
  let state: MockAppModeState = { appMode: 'cloud' };
  const listeners = new Set<MockAppModeListener>();
  return {
    useChatAppModeStore: {
      getState: () => state,
      setState: (next: MockAppModeState) => {
        const previous = state;
        state = next;
        listeners.forEach((listener) => listener(state, previous));
      },
      subscribe: (listener: MockAppModeListener) => {
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
        secureFetch: typeof import('@/services/secureFetch').secureFetch;
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
      secureFetch: require('@/services/secureFetch').secureFetch,
      mode: require('@/src/features/chat/store/appModeStore').useChatAppModeStore,
    };
    jest.mocked(context.secureStore.setItemAsync).mockReset().mockResolvedValue(undefined);
    jest.mocked(context.secureStore.deleteItemAsync).mockReset().mockResolvedValue(undefined);
    jest.mocked(context.secureStore.getItemAsync).mockReset().mockResolvedValue(null);
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
  mockEnsureCloudSendConsent.mockReset().mockResolvedValue(undefined);
});

describe('turning on Ask from Siri', () => {
  it('is refused without permission to share with AI providers and issues no token', async () => {
    const siri = load();
    const declined = new Error('declined');
    mockEnsureCloudSendConsent.mockRejectedValueOnce(declined);

    await expect(siri.enableAskFromSiri()).rejects.toBe(declined);

    expect(mockPost).not.toHaveBeenCalled();
    expect(siri.isAskFromSiriEnabled()).toBe(false);
  });

  it('asks for that permission before a token is issued', async () => {
    const siri = load();
    const order: string[] = [];
    mockEnsureCloudSendConsent.mockImplementationOnce(async () => {
      order.push('permission');
    });
    mockPost.mockImplementationOnce(async () => {
      order.push('issue');
      return TOKEN_A;
    });

    await siri.enableAskFromSiri();

    expect(order).toEqual(['permission', 'issue']);
    expect(siri.isAskFromSiriEnabled()).toBe(true);
  });
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
      timeout: 1_000,
      withdrawalControl: true,
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

describe('Ask from Siri turned off while another revoke is still waiting', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('gives a revoke no longer than the sign-out cleanup time, so the next turn-off behind it runs', async () => {
    const siri = load();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    await siri.enableAskFromSiri();
    jest.useFakeTimers();
    mockDelete
      .mockImplementationOnce(
        (_path: string, options: { timeout?: number }) =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('timed out')), options.timeout ?? 30_000);
          }),
      )
      .mockResolvedValueOnce({ revoked: true });

    const first = siri.disableAskFromSiri();
    const second = siri.disableAskFromSiri();
    const outcome: { statuses: string[] | null } = { statuses: null };
    void Promise.allSettled([first, second]).then((settled) => {
      outcome.statuses = settled.map((result) => result.status);
    });
    await jest.advanceTimersByTimeAsync(1_000);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    expect(outcome.statuses).toEqual(['rejected', 'fulfilled']);
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(siri.isAskFromSiriEnabled()).toBe(false);
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
      timeout: 1_000,
      withdrawalControl: true,
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
      timeout: 1_000,
      withdrawalControl: true,
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

  it('targets the old Siri token and preserves its replacement after a slow revocation', async () => {
    const { siri, account, secureStore, secureFetch } = loadContext();
    mockPost.mockResolvedValueOnce(TOKEN_A).mockResolvedValueOnce(TOKEN_B);
    await siri.enableAskFromSiri();
    const revoke = deferred<Response>();
    const requested = deferred<string>();
    jest.mocked(secureFetch).mockImplementationOnce((url) => {
      requested.resolve(String(url));
      return revoke.promise;
    });

    let endingSession = true;
    const cleanup = siri.revokeAskIntentForSignOut('old-clerk-token', () => endingSession);
    const endpoint = new URL(await requested.promise);
    expect(endpoint.searchParams.get('tokenId')).toBe(TOKEN_A.tokenId);
    endingSession = false;
    account.activateCloudAccount('account-b');
    await siri.enableAskFromSiri();
    revoke.resolve({ ok: true } as Response);
    await cleanup;

    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(mockStorage.get('ask-from-siri-token-id-v1')).toBe(TOKEN_B.tokenId);
    expect(siri.isAskFromSiriEnabled()).toBe(true);
  });

  it('publishes a replacement Siri token after an in-flight sign-out keychain deletion', async () => {
    const { siri, account, secureStore } = loadContext();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    await siri.enableAskFromSiri();
    const removal = deferred<void>();
    const removing = deferred<void>();
    let keychainToken: string | null = TOKEN_A.token;
    jest.mocked(secureStore.deleteItemAsync).mockImplementationOnce(async () => {
      removing.resolve(undefined);
      await removal.promise;
      keychainToken = null;
    });
    jest.mocked(secureStore.setItemAsync).mockImplementationOnce(async (_key, token) => {
      keychainToken = token;
    });
    const cleanup = siri.revokeAskIntentForSignOut('');
    await removing.promise;

    account.activateCloudAccount('account-b');
    const issue = deferIssue();
    const replacement = siri.enableAskFromSiri();
    await issue.started;
    issue.resolve(TOKEN_B);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
    removal.resolve(undefined);
    await Promise.all([cleanup, replacement]);

    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(2);
    expect(keychainToken).toBe(TOKEN_B.token);
    expect(mockStorage.get('ask-from-siri-token-id-v1')).toBe(TOKEN_B.tokenId);
    expect(siri.isAskFromSiriEnabled()).toBe(true);
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

describe('Ask from Siri when sharing with AI providers is withdrawn', () => {
  it('leaves no token on the phone when Cloud closes while the first token is being written', async () => {
    const { siri, mode, secureStore } = loadContext();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    const written = deferred<void>();
    const writing = deferred<void>();
    jest.mocked(secureStore.setItemAsync).mockImplementationOnce(() => {
      writing.resolve(undefined);
      return written.promise;
    });
    const enable = siri.enableAskFromSiri();
    const retired = expect(enable).rejects.toThrow('account or mode changed');
    await writing.promise;

    mode.setState({ appMode: 'local' });
    written.resolve(undefined);
    await retired;

    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      siri.ASK_INTENT_KEYCHAIN_KEY,
      expect.objectContaining({ keychainService: siri.ASK_INTENT_KEYCHAIN_SERVICE }),
    );
    expect(jest.mocked(secureStore.deleteItemAsync).mock.invocationCallOrder[0]).toBeGreaterThan(
      jest.mocked(secureStore.setItemAsync).mock.invocationCallOrder[0]!,
    );
    expect(siri.isAskFromSiriEnabled()).toBe(false);
    expect(mockStorage.has('ask-from-siri-token-id-v1')).toBe(false);
  });

  it('keeps a revoke owed when removing a first token that lost its owner fails', async () => {
    const { siri, mode, secureStore } = loadContext();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    const written = deferred<void>();
    const writing = deferred<void>();
    jest.mocked(secureStore.setItemAsync).mockImplementationOnce(() => {
      writing.resolve(undefined);
      return written.promise;
    });
    jest.mocked(secureStore.deleteItemAsync).mockRejectedValueOnce(new Error('keychain locked'));
    const enable = siri.enableAskFromSiri();
    const failed = expect(enable).rejects.toThrow('keychain locked');
    await writing.promise;

    mode.setState({ appMode: 'local' });
    written.resolve(undefined);
    await failed;

    expect(mockStorage.get('ask-from-siri-pending-revoke-token-v1')).toBe('install');
    expect(siri.isAskFromSiriEnabled()).toBe(false);
  });

  it('removes a token the keychain still holds when Ask from Siri is marked off, and owes its revoke', async () => {
    const { siri, secureStore, account } = loadContext();
    jest.mocked(secureStore.getItemAsync).mockResolvedValue(TOKEN_A.token);
    mockDelete.mockResolvedValue({ revoked: true });

    await siri.forgetAskFromSiriOnDevice();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(mockStorage.get('ask-from-siri-pending-revoke-token-v1')).toBe('install');

    await siri.revokeForgottenAskFromSiri();

    expect(mockDelete).toHaveBeenCalledWith('/api/mobile/intent-token?installId=install-12345', {
      accountEpoch: account.captureCloudAccountEpoch(),
      timeout: 1_000,
      withdrawalControl: true,
    });
    expect(mockStorage.has('ask-from-siri-pending-revoke-token-v1')).toBe(false);
  });

  it('owes no revoke and sends nothing when the keychain holds no token and none was recorded', async () => {
    const { siri, secureStore } = loadContext();

    await siri.forgetAskFromSiriOnDevice();
    await siri.revokeForgottenAskFromSiri();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(mockStorage.has('ask-from-siri-pending-revoke-token-v1')).toBe(false);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('owes the revoke when the keychain cannot be read, since a token may be there', async () => {
    const { siri, secureStore } = loadContext();
    jest.mocked(secureStore.getItemAsync).mockRejectedValue(new Error('keychain locked'));

    await siri.forgetAskFromSiriOnDevice();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(mockStorage.get('ask-from-siri-pending-revoke-token-v1')).toBe('install');
  });

  it('turns off from Local Mode with the withdrawal control, and clears the owed marker', async () => {
    const { siri, mode, account } = loadContext();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    await siri.enableAskFromSiri();
    mode.setState({ appMode: 'local' });
    mockDelete.mockResolvedValue({ revoked: true });

    await siri.disableAskFromSiri();

    expect(mockDelete).toHaveBeenCalledWith(`/api/mobile/intent-token?tokenId=${TOKEN_A.tokenId}`, {
      accountEpoch: account.captureCloudAccountEpoch(),
      timeout: 1_000,
      withdrawalControl: true,
    });
    expect(mockStorage.has('ask-from-siri-pending-revoke-token-v1')).toBe(false);
    expect(siri.isAskFromSiriEnabled()).toBe(false);
  });

  it('pays at a later launch a revoke an earlier launch still owed, through the withdrawal control', async () => {
    const { siri, account } = loadContext();
    mockStorage.set('ask-from-siri-pending-revoke-token-v1', 'install');
    mockDelete.mockResolvedValue({ revoked: true });

    await siri.revokeForgottenAskFromSiri();

    expect(mockDelete).toHaveBeenCalledWith('/api/mobile/intent-token?installId=install-12345', {
      accountEpoch: account.captureCloudAccountEpoch(),
      timeout: 1_000,
      withdrawalControl: true,
    });
    expect(mockStorage.has('ask-from-siri-pending-revoke-token-v1')).toBe(false);
  });

  it('removes the token from this device before any network call, then revokes it for the install', async () => {
    const { siri, secureStore, account } = loadContext();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    await siri.enableAskFromSiri();
    mockDelete.mockResolvedValue({ revoked: true });

    await siri.forgetAskFromSiriOnDevice();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      siri.ASK_INTENT_KEYCHAIN_KEY,
      expect.objectContaining({ keychainService: siri.ASK_INTENT_KEYCHAIN_SERVICE }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
    expect(siri.isAskFromSiriEnabled()).toBe(false);
    expect(mockStorage.get('ask-from-siri-pending-revoke-token-v1')).toBe('install');

    await siri.revokeForgottenAskFromSiri();

    expect(mockDelete).toHaveBeenCalledWith('/api/mobile/intent-token?installId=install-12345', {
      accountEpoch: account.captureCloudAccountEpoch(),
      timeout: 1_000,
      withdrawalControl: true,
    });
    expect(mockStorage.has('ask-from-siri-pending-revoke-token-v1')).toBe(false);
  });

  it('keeps the revoke owed when it fails, for the next launch', async () => {
    const { siri } = loadContext();
    mockStorage.set('ask-from-siri-enabled-v1', true);
    mockDelete.mockRejectedValueOnce(new Error('offline'));

    await siri.forgetAskFromSiriOnDevice();
    await expect(siri.revokeForgottenAskFromSiri()).rejects.toThrow('offline');

    expect(siri.isAskFromSiriEnabled()).toBe(false);
    expect(mockStorage.get('ask-from-siri-pending-revoke-token-v1')).toBe('install');
  });

  it('still reports Ask from Siri on when the token could not be removed', async () => {
    const { siri, secureStore } = loadContext();
    mockStorage.set('ask-from-siri-enabled-v1', true);
    jest.mocked(secureStore.deleteItemAsync).mockRejectedValueOnce(new Error('keychain locked'));

    await expect(siri.forgetAskFromSiriOnDevice()).rejects.toThrow('keychain locked');

    expect(siri.isAskFromSiriEnabled()).toBe(true);
  });

  it('removes again a token a rotation was already publishing, and never lets a waiting one publish', async () => {
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
    const retired = expect(rotation).rejects.toThrow('account or mode changed');
    await started.promise;

    await siri.forgetAskFromSiriOnDevice();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    const revoke = siri.revokeForgottenAskFromSiri();
    publication.resolve(undefined);
    await retired;
    await revoke;

    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
    expect(mockStorage.has('ask-from-siri-token-id-v1')).toBe(false);
    expect(siri.isAskFromSiriEnabled()).toBe(false);

    const waiting = deferIssue();
    mockStorage.set('ask-from-siri-enabled-v1', true);
    const next = siri.settleAskIntentOnLaunch();
    const nextRetired = expect(next).rejects.toThrow('account or mode changed');
    await waiting.started;
    await siri.forgetAskFromSiriOnDevice();
    waiting.resolve(TOKEN_A);
    await nextRetired;
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });
});

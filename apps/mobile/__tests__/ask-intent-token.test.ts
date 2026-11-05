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
  let context: {
    siri: typeof import('../src/features/siri/askIntentToken');
    account: typeof import('../src/features/auth/services/cloudAccountSession');
    secureStore: typeof import('expo-secure-store');
  } | undefined;
  jest.isolateModules(() => {
    context = {
      siri: require('../src/features/siri/askIntentToken'),
      account: require('@/src/features/auth/services/cloudAccountSession'),
      secureStore: require('expo-secure-store'),
    };
    context.account.__resetCloudAccountSessionForTests();
    context.account.activateCloudAccount('account-a');
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
    const issue = deferred<typeof TOKEN_A>();
    mockPost.mockReturnValueOnce(issue.promise);

    const first = siri.settleAskIntentOnLaunch();
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
    const issue = deferred<typeof TOKEN_A>();
    mockPost.mockReturnValueOnce(issue.promise).mockResolvedValueOnce(TOKEN_B);
    const first = siri.settleAskIntentOnLaunch();
    const failure = expect(first).rejects.toThrow('old failure');
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
    const oldIssue = deferred<typeof TOKEN_A>();
    const newIssue = deferred<typeof TOKEN_B>();
    mockPost
      .mockReturnValueOnce(oldIssue.promise)
      .mockReturnValueOnce(newIssue.promise)
      .mockResolvedValueOnce(TOKEN_B);
    const first = siri.settleAskIntentOnLaunch();
    const oldFailure = expect(first).rejects.toThrow('old failure');
    await siri.revokeAskIntentForSignOut('');
    mockStorage.set('ask-from-siri-enabled-v1', true);
    const replacement = siri.settleAskIntentOnLaunch();
    const replacementFailure = expect(replacement).rejects.toThrow('replacement failure');

    oldIssue.reject(new Error('old failure'));
    await oldFailure;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(2);

    newIssue.reject(new Error('replacement failure'));
    await replacementFailure;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(3);
  });

  it.each(['account-b', 'account-a'])('does not rearm a stale epoch for %s', async (ownerId) => {
    const { siri, account } = loadContext();
    const issue = deferred<typeof TOKEN_A>();
    mockPost.mockReturnValueOnce(issue.promise);
    const first = siri.settleAskIntentOnLaunch();
    const failure = expect(first).rejects.toThrow('stale failure');
    account.invalidateCloudAccount();
    account.activateCloudAccount(ownerId);

    issue.reject(new Error('stale failure'));
    await failure;
    await siri.settleAskIntentOnLaunch();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

describe('Ask from Siri token revocation', () => {
  it('a failed disable followed by a re-enable never revokes the new token on the next launch', async () => {
    const siri = load();
    mockPost.mockResolvedValueOnce(TOKEN_A);
    await siri.enableAskFromSiri();

    mockDelete.mockRejectedValueOnce(new Error('offline'));
    await expect(siri.disableAskFromSiri()).rejects.toThrow('offline');
    expect(mockDelete).toHaveBeenCalledWith(`/api/mobile/intent-token?tokenId=${TOKEN_A.tokenId}`);

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
    );

    mockDelete.mockClear();
    await load().settleAskIntentOnLaunch();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

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

function load(): typeof import('../src/features/siri/askIntentToken') {
  let mod: typeof import('../src/features/siri/askIntentToken') | undefined;
  jest.isolateModules(() => {
    mod = require('../src/features/siri/askIntentToken');
  });
  return mod!;
}

beforeEach(() => {
  mockStorage.clear();
  mockPost.mockReset();
  mockDelete.mockReset();
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

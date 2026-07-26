/* eslint-disable @typescript-eslint/no-require-imports */
const mockSecureStoreGet = jest.fn().mockResolvedValue('a'.repeat(64));
const mockSecureStoreSet = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockSecureStoreGet(...args),
  setItemAsync: (...args: unknown[]) => mockSecureStoreSet(...args),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
}));

const mockMmkvValues = new Map<string, string>();

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: (key: string) => mockMmkvValues.get(key),
    set: (key: string, value: string) => mockMmkvValues.set(key, value),
    delete: (key: string) => mockMmkvValues.delete(key),
  })),
}));

describe('encrypted MMKV hydration barrier', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockMmkvValues.clear();
  });

  it('waits for delayed store hydration before an owner-mismatch teardown', async () => {
    const { initMmkvEncryption, whenMmkvReady } =
      require('../lib/mmkv') as typeof import('../lib/mmkv');

    let releaseHydration: (() => void) | undefined;
    const hydrationGate = new Promise<void>((resolve) => {
      releaseHydration = resolve;
    });
    const accountScopedCache = { conversations: [] as string[] };

    whenMmkvReady(async () => {
      await hydrationGate;
      accountScopedCache.conversations = ['account-a-conversation'];
    });
    // This models the owner-mismatch teardown registered after Cloud stores
    // were imported. It must not run until their delayed rehydration settles.
    whenMmkvReady(() => {
      accountScopedCache.conversations = [];
    });

    let initSettled = false;
    const initialization = initMmkvEncryption().then(() => {
      initSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(initSettled).toBe(false);
    expect(accountScopedCache.conversations).toEqual([]);

    releaseHydration?.();
    await initialization;

    expect(initSettled).toBe(true);
    expect(accountScopedCache.conversations).toEqual([]);
  });
});

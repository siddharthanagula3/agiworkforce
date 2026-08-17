/* eslint-disable @typescript-eslint/no-require-imports */
const mockSecureStoreGet = jest.fn().mockResolvedValue('b'.repeat(64));
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

const APP_MODE_STORE_KEY = 'chat-app-mode-store';

describe('Cloud mode across a cold start', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockMmkvValues.clear();
  });

  it('restores Cloud mode once encrypted MMKV finishes launch init', async () => {
    mockMmkvValues.set(
      APP_MODE_STORE_KEY,
      JSON.stringify({ state: { appMode: 'cloud' }, version: 0 }),
    );

    const { initMmkvEncryption } = require('../lib/mmkv') as typeof import('../lib/mmkv');
    const { useChatAppModeStore } =
      require('../src/features/chat/store/appModeStore') as typeof import('../src/features/chat/store/appModeStore');

    expect(useChatAppModeStore.getState().appMode).toBe('local');

    await initMmkvEncryption();

    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
  });

  it('keeps Local mode when nothing was persisted', async () => {
    const { initMmkvEncryption } = require('../lib/mmkv') as typeof import('../lib/mmkv');
    const { useChatAppModeStore } =
      require('../src/features/chat/store/appModeStore') as typeof import('../src/features/chat/store/appModeStore');

    await initMmkvEncryption();

    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('persists a Cloud switch so the next cold start reads it back', async () => {
    const { initMmkvEncryption } = require('../lib/mmkv') as typeof import('../lib/mmkv');
    const { useChatAppModeStore } =
      require('../src/features/chat/store/appModeStore') as typeof import('../src/features/chat/store/appModeStore');

    await initMmkvEncryption();
    useChatAppModeStore.getState().setAppMode('cloud');

    expect(JSON.parse(mockMmkvValues.get(APP_MODE_STORE_KEY) ?? '{}').state.appMode).toBe('cloud');
  });
});

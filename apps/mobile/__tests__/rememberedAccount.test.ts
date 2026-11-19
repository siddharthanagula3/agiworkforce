jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  };
});

const mockInstallStore = new Map<string, string>();
let mockMmkvReady = true;
const mockReadyCallbacks: Array<() => void> = [];
jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: (callback: () => void) => {
    if (mockMmkvReady) callback();
    else mockReadyCallbacks.push(callback);
  },
  storage: {
    getString: (key: string) => mockInstallStore.get(key),
    set: (key: string, value: string) => {
      mockInstallStore.set(key, value);
    },
  },
}));

import {
  forgetRememberedAccount,
  parseRememberedAccount,
  readRememberedAccount,
  readRememberedAccountForSignIn,
  rememberAccount,
} from '../src/features/auth/services/rememberedAccount';
import * as SecureStore from 'expo-secure-store';

const mockSecureStore = jest.mocked(SecureStore);
const mockStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;

describe('remembered account', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    mockStore.clear();
    mockInstallStore.clear();
    mockMmkvReady = true;
    mockReadyCallbacks.length = 0;
    jest.clearAllMocks();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('keeps only the email and the method, in secure storage', async () => {
    await rememberAccount({ email: 'a@example.com', method: 'google' });

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    const [, value, options] = mockSecureStore.setItemAsync.mock.calls[0] as [
      string,
      string,
      { keychainAccessible: string },
    ];
    expect(JSON.parse(value)).toEqual({ email: 'a@example.com', method: 'google' });
    expect(options.keychainAccessible).toBe(mockSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
    await expect(readRememberedAccount()).resolves.toEqual({
      email: 'a@example.com',
      method: 'google',
    });
  });

  it('replaces the previous account with the latest one', async () => {
    await rememberAccount({ email: 'a@example.com', method: 'apple' });
    await rememberAccount({ email: 'b@example.com', method: 'email' });

    await expect(readRememberedAccount()).resolves.toEqual({
      email: 'b@example.com',
      method: 'email',
    });
  });

  it('does not store something that is not an email address', async () => {
    await rememberAccount({ email: 'not an email', method: 'email' });

    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
    await expect(readRememberedAccount()).resolves.toBeNull();
  });

  it('forgets the account', async () => {
    await rememberAccount({ email: 'a@example.com', method: 'email' });
    await forgetRememberedAccount();

    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    await expect(readRememberedAccount()).resolves.toBeNull();
  });

  it('reads nothing when no account was remembered', async () => {
    await expect(readRememberedAccount()).resolves.toBeNull();
  });

  it.each([
    ['text that is not JSON', 'nope'],
    ['an array', '[]'],
    ['a missing method', JSON.stringify({ email: 'a@example.com' })],
    ['an unknown method', JSON.stringify({ email: 'a@example.com', method: 'passkey' })],
    ['an invalid email', JSON.stringify({ email: 'a', method: 'email' })],
  ])('treats %s as no account', (_label, raw) => {
    expect(parseRememberedAccount(raw)).toBeNull();
  });

  it('never throws when secure storage fails', async () => {
    mockSecureStore.getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    mockSecureStore.setItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    mockSecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keychain locked'));

    await expect(readRememberedAccount()).resolves.toBeNull();
    await expect(
      rememberAccount({ email: 'a@example.com', method: 'email' }),
    ).resolves.toBeUndefined();
    await expect(forgetRememberedAccount()).resolves.toBeUndefined();
  });

  describe('on the sign-in screen after an install', () => {
    it('forgets an account a previous install left in the keychain, once', async () => {
      await rememberAccount({ email: 'previous@example.com', method: 'email' });

      await expect(readRememberedAccountForSignIn()).resolves.toBeNull();
      expect(mockStore.size).toBe(0);

      await rememberAccount({ email: 'a@example.com', method: 'google' });
      await expect(readRememberedAccountForSignIn()).resolves.toEqual({
        email: 'a@example.com',
        method: 'google',
      });
    });

    it('returns an account this install remembered', async () => {
      await readRememberedAccountForSignIn();
      await rememberAccount({ email: 'a@example.com', method: 'email' });

      await expect(readRememberedAccountForSignIn()).resolves.toEqual({
        email: 'a@example.com',
        method: 'email',
      });
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    });

    it('shows nothing and tries again next time when the old account cannot be removed', async () => {
      await rememberAccount({ email: 'previous@example.com', method: 'email' });
      mockSecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keychain locked'));

      await expect(readRememberedAccountForSignIn()).resolves.toBeNull();
      expect(mockInstallStore.size).toBe(0);

      await expect(readRememberedAccountForSignIn()).resolves.toBeNull();
      expect(mockStore.size).toBe(0);
      expect(mockInstallStore.size).toBe(1);
    });

    it('reads nothing until the app storage that holds the install marker is ready', async () => {
      mockMmkvReady = false;
      await rememberAccount({ email: 'previous@example.com', method: 'email' });

      const pending = readRememberedAccountForSignIn();
      await Promise.resolve();
      expect(mockSecureStore.getItemAsync).not.toHaveBeenCalled();

      mockMmkvReady = true;
      mockReadyCallbacks.forEach((callback) => callback());
      await expect(pending).resolves.toBeNull();
    });
  });
});


const DEVICE_ONLY = 'AfterFirstUnlockThisDeviceOnly';

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly',
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SecureStoreMock = require('expo-secure-store') as {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

import { secureStorage } from '../../../lib/secureStorage';

describe('L1 Security - Data Isolation (Secret Storage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('SECURITY: secrets are written device-only (never iCloud-backed)', async () => {
    await secureStorage.setItem('auth-session', 'token-abc');
    expect(SecureStoreMock.setItemAsync).toHaveBeenCalledWith('auth-session', 'token-abc', {
      keychainAccessible: DEVICE_ONLY,
    });
  });

  test('SECURITY: crafted keys are sanitized so they cannot escape the namespace', async () => {
    await secureStorage.setItem('../../etc/passwd', 'x');
    const [writtenKey] = SecureStoreMock.setItemAsync.mock.calls[0];
    expect(writtenKey).toBe('.._.._etc_passwd');
    expect(writtenKey).not.toContain('/');
    expect(writtenKey).not.toMatch(/[^A-Za-z0-9._-]/);
  });

  test('SECURITY: get/set/remove all use the same sanitized key (no aliasing)', async () => {
    SecureStoreMock.getItemAsync.mockResolvedValueOnce('v');
    await secureStorage.setItem('a b/c', 'v');
    await secureStorage.getItem('a b/c');
    await secureStorage.removeItem('a b/c');
    expect(SecureStoreMock.setItemAsync.mock.calls[0][0]).toBe('a_b_c');
    expect(SecureStoreMock.getItemAsync.mock.calls[0][0]).toBe('a_b_c');
    expect(SecureStoreMock.deleteItemAsync.mock.calls[0][0]).toBe('a_b_c');
  });

  test('SECURITY: locked keychain (Before-First-Unlock) returns null, does not leak/throw', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    SecureStoreMock.getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    await expect(secureStorage.getItem('auth-session')).resolves.toBeNull();
    warnSpy.mockRestore();
  });

  test('SECURITY: write failure propagates so a dropped token is never silent', async () => {
    SecureStoreMock.setItemAsync.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(secureStorage.setItem('auth-session', 'token')).rejects.toThrow('quota exceeded');
  });

  test('SECURITY: missing secret returns null (no foreign/default value)', async () => {
    SecureStoreMock.getItemAsync.mockResolvedValueOnce(null);
    await expect(secureStorage.getItem('auth-session')).resolves.toBeNull();
  });
});

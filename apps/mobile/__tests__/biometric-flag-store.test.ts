/**
 * Regression tests for LOW-MOB-1 — biometric-lock flag in SecureStore
 * (red-team finding 2026-05).
 *
 * Pre-fix: `biometricLockEnabled` was stored in the MMKV-backed
 * `settingsStore`. If the MMKV encryption key was ever extracted,
 * an attacker could flip the flag to `false` from outside the app and
 * bypass the biometric gate without ever passing biometric auth.
 *
 * Post-fix: the flag lives in SecureStore (iOS Keychain /
 * Android EncryptedSharedPreferences with hardware-backed Keystore on
 * v23+). MMKV-key extraction does not help an attacker.
 *
 * These tests pin:
 *   - the storage key,
 *   - the accessibility option (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`),
 *   - hydrate semantics (only literal 'true' enables the gate),
 *   - graceful failure on SecureStore errors (fail-CLOSED-ish: hydrated
 *     marker is set so the app boots, but enabled stays false).
 */

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WUTDO',
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));

import { useBiometricFlag, hydrateBiometricFlag } from '../lib/biometricFlagStore';

beforeEach(() => {
  mockGetItemAsync.mockReset().mockResolvedValue(null);
  mockSetItemAsync.mockReset().mockResolvedValue(undefined);
  // Reset the in-memory state to its initial values between tests.
  useBiometricFlag.setState({ hydrated: false, enabled: false });
});

describe('biometricFlagStore — initial state', () => {
  it('starts unhydrated and disabled', () => {
    const s = useBiometricFlag.getState();
    expect(s.hydrated).toBe(false);
    expect(s.enabled).toBe(false);
  });
});

describe('biometricFlagStore — hydrate', () => {
  it('reads "true" from SecureStore → enabled=true', async () => {
    mockGetItemAsync.mockResolvedValueOnce('true');
    await useBiometricFlag.getState().hydrate();
    expect(useBiometricFlag.getState().enabled).toBe(true);
    expect(useBiometricFlag.getState().hydrated).toBe(true);
    expect(mockGetItemAsync).toHaveBeenCalledWith('agi_biometric_lock_enabled_v1');
  });

  it('reads "false" → enabled=false', async () => {
    mockGetItemAsync.mockResolvedValueOnce('false');
    await useBiometricFlag.getState().hydrate();
    expect(useBiometricFlag.getState().enabled).toBe(false);
    expect(useBiometricFlag.getState().hydrated).toBe(true);
  });

  it('treats null (never set) as enabled=false', async () => {
    mockGetItemAsync.mockResolvedValueOnce(null);
    await useBiometricFlag.getState().hydrate();
    expect(useBiometricFlag.getState().enabled).toBe(false);
    expect(useBiometricFlag.getState().hydrated).toBe(true);
  });

  it.each(['TRUE', 'True', '1', 'yes', 'on', 'enabled', ''])(
    'treats non-literal "%s" as enabled=false (strict-equality check)',
    async (stored) => {
      mockGetItemAsync.mockResolvedValueOnce(stored);
      await useBiometricFlag.getState().hydrate();
      expect(useBiometricFlag.getState().enabled).toBe(false);
    },
  );

  it('survives SecureStore read errors (fail-closed for enabled, hydrated marked true)', async () => {
    mockGetItemAsync.mockRejectedValueOnce(new Error('keychain offline'));
    await useBiometricFlag.getState().hydrate();
    expect(useBiometricFlag.getState().enabled).toBe(false);
    expect(useBiometricFlag.getState().hydrated).toBe(true);
  });

  it('hydrateBiometricFlag() helper invokes the same path', async () => {
    mockGetItemAsync.mockResolvedValueOnce('true');
    await hydrateBiometricFlag();
    expect(useBiometricFlag.getState().enabled).toBe(true);
  });
});

describe('biometricFlagStore — setEnabled', () => {
  it('writes "true" to SecureStore with WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    await useBiometricFlag.getState().setEnabled(true);
    expect(mockSetItemAsync).toHaveBeenCalledWith('agi_biometric_lock_enabled_v1', 'true', {
      keychainAccessible: 'WUTDO',
    });
    expect(useBiometricFlag.getState().enabled).toBe(true);
  });

  it('writes "false" on disable', async () => {
    await useBiometricFlag.getState().setEnabled(false);
    expect(mockSetItemAsync).toHaveBeenCalledWith(
      'agi_biometric_lock_enabled_v1',
      'false',
      expect.any(Object),
    );
    expect(useBiometricFlag.getState().enabled).toBe(false);
  });

  it('propagates SecureStore write errors (caller decides what to do)', async () => {
    mockSetItemAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(useBiometricFlag.getState().setEnabled(true)).rejects.toThrow('disk full');
    // In-memory state must NOT advance if persistence failed.
    expect(useBiometricFlag.getState().enabled).toBe(false);
  });
});

describe('biometricFlagStore — tamper resistance contract', () => {
  it('does NOT read from MMKV (the pre-fix backing store)', () => {
    // No MMKV import in the file — sentinel test catches a regression that
    // accidentally re-introduces an MMKV path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'biometricFlagStore.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"]react-native-mmkv['"]/);
    expect(src).not.toMatch(/from\s+['"]@\/lib\/mmkv['"]/);
    expect(src).toContain('expo-secure-store');
    expect(src).toContain('WHEN_UNLOCKED_THIS_DEVICE_ONLY');
  });
});

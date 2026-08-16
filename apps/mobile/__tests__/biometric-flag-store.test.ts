
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
  useBiometricFlag.setState({ hydrated: false, enabled: true });
});

describe('biometricFlagStore — initial state', () => {
  it('starts unhydrated and ENABLED (fail-closed)', () => {
    const s = useBiometricFlag.getState();
    expect(s.hydrated).toBe(false);
    expect(s.enabled).toBe(true);
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

  it('treats null (never set) as enabled=false so first-run users are not app-locked', async () => {
    mockGetItemAsync.mockResolvedValueOnce(null);
    await useBiometricFlag.getState().hydrate();
    expect(useBiometricFlag.getState().enabled).toBe(false);
    expect(useBiometricFlag.getState().hydrated).toBe(true);
  });

  it.each(['TRUE', 'True', '1', 'yes', 'on', 'enabled', ''])(
    'treats non-literal "%s" as enabled=false (only literal "true" enables)',
    async (stored) => {
      mockGetItemAsync.mockResolvedValueOnce(stored);
      await useBiometricFlag.getState().hydrate();
      expect(useBiometricFlag.getState().enabled).toBe(false);
    },
  );

  it('survives SecureStore read errors (fail-CLOSED: enabled stays true)', async () => {
    mockGetItemAsync.mockRejectedValueOnce(new Error('keychain offline'));
    await useBiometricFlag.getState().hydrate();
    expect(useBiometricFlag.getState().enabled).toBe(true);
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
    await expect(useBiometricFlag.getState().setEnabled(false)).rejects.toThrow('disk full');
    expect(useBiometricFlag.getState().enabled).toBe(true);
  });
});

describe('biometricFlagStore — tamper resistance contract', () => {
  it('does NOT read from MMKV (the pre-fix backing store)', () => {
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

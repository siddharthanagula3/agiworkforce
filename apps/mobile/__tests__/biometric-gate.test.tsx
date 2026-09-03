import { renderHook, act } from '@testing-library/react-native';

const mockAuthenticateAsync = jest.fn();
const mockHasHardwareAsync = jest.fn();
const mockIsEnrolledAsync = jest.fn();
jest.mock('expo-local-authentication', () => ({
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
  hasHardwareAsync: () => mockHasHardwareAsync(),
  isEnrolledAsync: () => mockIsEnrolledAsync(),
}));

let mockBiometricLockEnabledFlag = true;
jest.mock('@/lib/biometricFlagStore', () => ({
  useBiometricFlag: (selector: (s: { enabled: boolean; hydrated: boolean }) => unknown) =>
    selector({ enabled: mockBiometricLockEnabledFlag, hydrated: true }),
  hydrateBiometricFlag: jest.fn().mockResolvedValue(undefined),
}));

import { useBiometricGate } from '../src/features/auth/hooks/useBiometricGate';

let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC;
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockBiometricLockEnabledFlag = true;
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
});

describe('useBiometricGate, fail-closed on error', () => {
  it('stays locked when authenticateAsync throws', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockRejectedValue(new Error('ERR_LOCKOUT'));

    const { result } = renderHook(() => useBiometricGate());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.authenticate();
    });

    expect(returned).toBe(false);
    expect(result.current.isUnlocked).toBe(false);
  });

  it('stays locked when authenticateAsync returns {success: false}', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });

    const { result } = renderHook(() => useBiometricGate());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.authenticate();
    });

    expect(returned).toBe(false);
    expect(result.current.isUnlocked).toBe(false);
  });

  it('stays locked when hasHardwareAsync rejects (subsystem failure)', async () => {
    mockHasHardwareAsync.mockRejectedValue(new Error('boom'));
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBiometricGate());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.authenticate();
    });

    expect(returned).toBe(false);
    expect(result.current.isUnlocked).toBe(false);
  });

  it('falls back to passcode when no biometric hardware/enrollment, stays locked if passcode fails', async () => {
    mockHasHardwareAsync.mockResolvedValue(false);
    mockIsEnrolledAsync.mockResolvedValue(false);
    mockAuthenticateAsync.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useBiometricGate());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.authenticate();
    });

    expect(returned).toBe(false);
    expect(result.current.isUnlocked).toBe(false);
    expect(mockAuthenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: false }),
    );
  });

  it('unlocks via passcode fallback when no biometric AND passcode succeeds', async () => {
    mockHasHardwareAsync.mockResolvedValue(false);
    mockIsEnrolledAsync.mockResolvedValue(false);
    mockAuthenticateAsync.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBiometricGate());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.authenticate();
    });

    expect(returned).toBe(true);
    expect(result.current.isUnlocked).toBe(true);
  });

  it('unlocks when biometric authenticateAsync succeeds', async () => {
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBiometricGate());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.authenticate();
    });

    expect(returned).toBe(true);
    expect(result.current.isUnlocked).toBe(true);
  });
});

describe('useBiometricGate, visual QA bypass', () => {
  it('unlocks in dev visual QA mode without calling OS authentication', async () => {
    process.env.EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC = '1';
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockAuthenticateAsync.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useBiometricGate());

    expect(result.current.isUnlocked).toBe(true);
    expect(result.current.isLocked).toBe(false);

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.authenticate();
    });

    expect(returned).toBe(true);
    expect(result.current.isUnlocked).toBe(true);
    expect(mockAuthenticateAsync).not.toHaveBeenCalled();
  });
});

describe('useBiometricGate, gate disabled', () => {
  it('always reports unlocked when biometricLockEnabled is false', async () => {
    mockBiometricLockEnabledFlag = false;
    mockAuthenticateAsync.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useBiometricGate());

    expect(result.current.isUnlocked).toBe(true);

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.authenticate();
    });

    expect(returned).toBe(true);
    expect(result.current.isUnlocked).toBe(true);
    expect(mockAuthenticateAsync).not.toHaveBeenCalled();
  });
});

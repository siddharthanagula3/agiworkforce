/**
 * Regression tests for HIGH-MOB-01 / CRIT-MOB-BIOMETRIC-FAIL-OPEN
 * (red-team finding 2026-05).
 *
 * Pre-fix behaviour: the catch block of `authenticate()` set
 * `setIsUnlocked(true)` and returned `true` on ANY thrown error, including
 * `ERR_LOCKOUT` (too many failed attempts) and exceptions injected via
 * Frida / OEM bugs. An attacker with physical access to a locked device
 * could trigger an exception in the biometric subsystem and the app would
 * silently unlock.
 *
 * Post-fix invariant: the gate fails CLOSED. The only way to reach
 * `isUnlocked = true` is:
 *   1. `biometricLockEnabled` is false (gate disabled), or
 *   2. `LocalAuthentication.authenticateAsync` returns `{success: true}`,
 *      either via biometric or the OS passcode fallback.
 * Every other path — promise rejection, unsuccessful result, missing
 * hardware AND no passcode — keeps the gate locked.
 *
 * These tests pin the contract via the public hook surface. The behaviour
 * under test is the catch path (the most security-critical path) plus the
 * branches that previously short-circuited to "auto-unlock when no
 * hardware". We do NOT test internal implementation details, only:
 *   - return value of `authenticate()`
 *   - reflected `isUnlocked` state after each call
 */

import { renderHook, act } from '@testing-library/react-native';

const mockAuthenticateAsync = jest.fn();
const mockHasHardwareAsync = jest.fn();
const mockIsEnrolledAsync = jest.fn();
jest.mock('expo-local-authentication', () => ({
  authenticateAsync: (...args: unknown[]) => mockAuthenticateAsync(...args),
  hasHardwareAsync: () => mockHasHardwareAsync(),
  isEnrolledAsync: () => mockIsEnrolledAsync(),
}));

// jest-expo provides AppState mocks out of the box; we don't need a custom
// react-native mock here. The hook subscribes for foreground transitions
// which we never fire in these unit tests.

// LOW-MOB-1 fix: the flag now lives in SecureStore-backed
// lib/biometricFlagStore.ts, not in the MMKV-backed settingsStore.
let mockBiometricLockEnabledFlag = true;
jest.mock('@/lib/biometricFlagStore', () => ({
  useBiometricFlag: (selector: (s: { enabled: boolean }) => unknown) =>
    selector({ enabled: mockBiometricLockEnabledFlag }),
  hydrateBiometricFlag: jest.fn().mockResolvedValue(undefined),
}));

import { useBiometricGate } from '../hooks/useBiometricGate';

beforeEach(() => {
  jest.clearAllMocks();
  mockBiometricLockEnabledFlag = true;
});

describe('useBiometricGate — fail-closed on error', () => {
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

describe('useBiometricGate — gate disabled', () => {
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
    // The OS prompt MUST NOT have been triggered when the gate is disabled.
    expect(mockAuthenticateAsync).not.toHaveBeenCalled();
  });
});

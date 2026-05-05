import { useState, useEffect, useCallback, useRef } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { useBiometricFlag } from '@/lib/biometricFlagStore';
import { AppState, type AppStateStatus } from 'react-native';

interface BiometricGateResult {
  isUnlocked: boolean;
  authenticate: () => Promise<boolean>;
}

export function useBiometricGate(): BiometricGateResult {
  // LOW-MOB-1 fix (red-team 2026-05): the flag lives in SecureStore, not
  // MMKV — extracting the MMKV encryption key no longer disables the gate.
  // See lib/biometricFlagStore.ts for the rationale.
  const biometricLockEnabled = useBiometricFlag((s) => s.enabled);
  const [isUnlocked, setIsUnlocked] = useState(!biometricLockEnabled);
  const previousStateRef = useRef<AppStateStatus>(AppState.currentState);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!biometricLockEnabled) {
      setIsUnlocked(true);
      return true;
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      // CRIT-MOB-01 fix (2026-05-04): if biometric is not enrolled or hardware
      // is absent we do NOT auto-unlock. We attempt a device passcode challenge
      // instead (`disableDeviceFallback: false` triggers the OS PIN/password
      // prompt when biometric is unavailable). Only if the OS itself says there
      // is no fallback authentication at all do we allow through — in that
      // case the device is already unprotected at the OS level and a software
      // gate adds no real security.
      if (!hasHardware || !isEnrolled) {
        // Still attempt OS-level passcode prompt; if unavailable it will return
        // success immediately (device has no screen lock at all).
        const fallbackResult = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock AGI Workforce',
          fallbackLabel: 'Use Passcode',
          disableDeviceFallback: false,
        });
        if (fallbackResult.success) {
          setIsUnlocked(true);
          return true;
        }
        // Passcode prompt failed or was cancelled — stay locked.
        setIsUnlocked(false);
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock AGI Workforce',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsUnlocked(true);
        return true;
      }
      setIsUnlocked(false);
      return false;
    } catch (err) {
      // CRIT-MOB-01 fix: fail CLOSED on any error. A Frida-injected exception
      // or OEM bug must never unlock the app.
      console.warn('[biometric] Authentication error — staying locked:', err);
      setIsUnlocked(false);
      return false;
    }
  }, [biometricLockEnabled]);

  // Prompt on mount if lock is enabled
  useEffect(() => {
    if (biometricLockEnabled && !isUnlocked) {
      authenticate();
    }
  }, [biometricLockEnabled, isUnlocked, authenticate]);

  // Re-lock only when returning from background (not from biometric prompt)
  useEffect(() => {
    if (!biometricLockEnabled) return;

    const handleAppState = (nextState: AppStateStatus) => {
      const prev = previousStateRef.current;
      previousStateRef.current = nextState;

      // Only re-lock on background → active transition.
      // Ignores inactive → active (which happens when biometric prompt dismisses).
      if (prev === 'background' && nextState === 'active') {
        setIsUnlocked(false);
        authenticate();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [biometricLockEnabled, authenticate]);

  // If lock is disabled, always unlocked
  useEffect(() => {
    if (!biometricLockEnabled) {
      setIsUnlocked(true);
    }
  }, [biometricLockEnabled]);

  return { isUnlocked, authenticate };
}

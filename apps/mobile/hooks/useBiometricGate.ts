import { useState, useEffect, useCallback, useRef } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSettingsStore } from '@/stores/settingsStore';
import { AppState, type AppStateStatus } from 'react-native';

interface BiometricGateResult {
  isUnlocked: boolean;
  authenticate: () => Promise<boolean>;
}

export function useBiometricGate(): BiometricGateResult {
  const biometricLockEnabled = useSettingsStore((s) => s.biometricLockEnabled);
  const [isUnlocked, setIsUnlocked] = useState(!biometricLockEnabled);
  const previousStateRef = useRef<AppStateStatus>(AppState.currentState);

  const authenticate = useCallback(async (): Promise<boolean> => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setIsUnlocked(true);
        return true;
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
      return false;
    } catch (err) {
      // Unlock on error to prevent app lockout, but log for debugging
      console.warn('[biometric] Authentication error, unlocking by default:', err);
      setIsUnlocked(true);
      return true;
    }
  }, []);

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

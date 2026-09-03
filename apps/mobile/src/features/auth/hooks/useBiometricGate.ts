import { useState, useEffect, useCallback, useRef } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { useBiometricFlag } from '@/lib/biometricFlagStore';
import { AppState, type AppStateStatus } from 'react-native';

interface BiometricGateResult {
  isUnlocked: boolean;
  isReady: boolean;
  isLocked: boolean;
  authenticate: () => Promise<boolean>;
}

export function useBiometricGate(): BiometricGateResult {
  const visualQaBiometricBypassEnabled =
    __DEV__ && process.env.EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC === '1';
  const biometricLockEnabled = useBiometricFlag((s) => s.enabled);
  const hydrated = useBiometricFlag((s) => s.hydrated);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const previousStateRef = useRef<AppStateStatus>(AppState.currentState);
  const authenticationPromiseRef = useRef<Promise<boolean> | null>(null);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (authenticationPromiseRef.current) {
      return authenticationPromiseRef.current;
    }

    const authenticationPromise = (async (): Promise<boolean> => {
      if (!hydrated) {
        setIsUnlocked(false);
        return false;
      }

      if (visualQaBiometricBypassEnabled) {
        setIsUnlocked(true);
        return true;
      }

      if (!biometricLockEnabled) {
        setIsUnlocked(true);
        return true;
      }

      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled) {
          const fallbackResult = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock AGI Workforce',
            fallbackLabel: 'Use Passcode',
            disableDeviceFallback: false,
          });
          if (fallbackResult.success) {
            setIsUnlocked(true);
            return true;
          }
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
        console.warn('[biometric] Authentication error, staying locked:', err);
        setIsUnlocked(false);
        return false;
      }
    })();

    authenticationPromiseRef.current = authenticationPromise;
    void authenticationPromise.then(
      () => {
        if (authenticationPromiseRef.current === authenticationPromise) {
          authenticationPromiseRef.current = null;
        }
      },
      () => {
        if (authenticationPromiseRef.current === authenticationPromise) {
          authenticationPromiseRef.current = null;
        }
      },
    );
    return authenticationPromise;
  }, [hydrated, biometricLockEnabled, visualQaBiometricBypassEnabled]);

  useEffect(() => {
    if (visualQaBiometricBypassEnabled) {
      setIsUnlocked(true);
      return;
    }

    if (hydrated && biometricLockEnabled && !isUnlocked) {
      void authenticate();
    }
  }, [hydrated, biometricLockEnabled, isUnlocked, authenticate, visualQaBiometricBypassEnabled]);

  useEffect(() => {
    if (!hydrated || !biometricLockEnabled || visualQaBiometricBypassEnabled) return;

    const handleAppState = (nextState: AppStateStatus) => {
      const prev = previousStateRef.current;
      previousStateRef.current = nextState;

      if (prev === 'background' && nextState === 'active') {
        setIsUnlocked(false);
        void authenticate();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [hydrated, biometricLockEnabled, authenticate, visualQaBiometricBypassEnabled]);

  // pre-hydration we treat the gate as engaged for fail-closed safety).
  useEffect(() => {
    if (hydrated && (!biometricLockEnabled || visualQaBiometricBypassEnabled)) {
      setIsUnlocked(true);
    }
  }, [hydrated, biometricLockEnabled, visualQaBiometricBypassEnabled]);

  if (!hydrated) {
    return {
      isUnlocked: false,
      isReady: false,
      isLocked: true,
      authenticate,
    };
  }

  return {
    isUnlocked: visualQaBiometricBypassEnabled ? true : isUnlocked,
    isReady: true,
    isLocked: visualQaBiometricBypassEnabled ? false : !isUnlocked,
    authenticate,
  };
}

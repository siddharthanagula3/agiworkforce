import { useState, useEffect, useCallback, useRef } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { useBiometricFlag } from '@/lib/biometricFlagStore';
import { AppState, type AppStateStatus } from 'react-native';

interface BiometricGateResult {
  isUnlocked: boolean;
  isReady: boolean;
  isLocked: boolean;
  /** True while the app is not frontmost, so the switcher snapshot is covered. */
  isCovered: boolean;
  authenticate: () => Promise<boolean>;
}

/**
 * Below this the app was never really away: the OS puts it inactive for the
 * unlock sheet itself, and re-locking there would prompt in a loop.
 */
const APP_SWITCH_RELOCK_GRACE_MS = 1_500;

export function useBiometricGate(): BiometricGateResult {
  const visualQaBiometricBypassEnabled =
    __DEV__ && process.env.EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC === '1';
  const biometricLockEnabled = useBiometricFlag((s) => s.enabled);
  const hydrated = useBiometricFlag((s) => s.hydrated);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isCovered, setIsCovered] = useState(false);
  const [isForeground, setIsForeground] = useState(AppState.currentState !== 'background');
  const awaySinceRef = useRef<number | null>(null);
  const reachedBackgroundRef = useRef(false);
  const authenticationSettledAtRef = useRef(0);
  const authenticationPromiseRef = useRef<Promise<boolean> | null>(null);
  // What the gate last decided, which survives the cover the app puts up while
  // it is away. Only an authentication or the flag moves it.
  const gateRef = useRef(false);

  const applyGate = useCallback((next: boolean): void => {
    gateRef.current = next;
    setIsUnlocked(next);
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (authenticationPromiseRef.current) {
      return authenticationPromiseRef.current;
    }

    const authenticationPromise = (async (): Promise<boolean> => {
      if (!hydrated) {
        applyGate(false);
        return false;
      }

      if (visualQaBiometricBypassEnabled) {
        applyGate(true);
        return true;
      }

      if (!biometricLockEnabled) {
        applyGate(true);
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
            applyGate(true);
            return true;
          }
          applyGate(false);
          return false;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock AGI Workforce',
          fallbackLabel: 'Use Passcode',
          disableDeviceFallback: false,
        });

        if (result.success) {
          applyGate(true);
          return true;
        }
        applyGate(false);
        return false;
      } catch (err) {
        console.warn('[biometric] Authentication error, staying locked:', err);
        applyGate(false);
        return false;
      }
    })();

    authenticationPromiseRef.current = authenticationPromise;
    const settle = (): void => {
      authenticationSettledAtRef.current = Date.now();
      if (authenticationPromiseRef.current === authenticationPromise) {
        authenticationPromiseRef.current = null;
      }
    };
    void authenticationPromise.then(settle, settle);
    return authenticationPromise;
  }, [hydrated, biometricLockEnabled, visualQaBiometricBypassEnabled, applyGate]);

  useEffect(() => {
    if (visualQaBiometricBypassEnabled) {
      applyGate(true);
      return;
    }

    // Never prompt while the app is away: the sheet would land behind the
    // switcher and the user would meet it on a screen they did not open.
    if (hydrated && biometricLockEnabled && !isUnlocked && isForeground) {
      void authenticate();
    }
  }, [
    hydrated,
    biometricLockEnabled,
    isUnlocked,
    isForeground,
    authenticate,
    visualQaBiometricBypassEnabled,
    applyGate,
  ]);

  useEffect(() => {
    if (!hydrated || !biometricLockEnabled || visualQaBiometricBypassEnabled) return;

    const handleAppState = (nextState: AppStateStatus) => {
      // iOS snapshots the app as it leaves the foreground, and that snapshot is
      // what the app switcher shows. Locking only on the way back meant the
      // switcher carried the user's conversation the whole time the app was
      // away. Cover first, without prompting: the prompt belongs to the return.
      setIsCovered(nextState !== 'active');
      setIsForeground(nextState === 'active');

      if (nextState !== 'active') {
        if (awaySinceRef.current === null) awaySinceRef.current = Date.now();
        if (nextState === 'background') reachedBackgroundRef.current = true;
        // Fail closed on the way out, so nothing gated stays readable while the
        // app sits in the switcher or the OS suspends it. The decision itself is
        // untouched, so a brief peek comes back to where the user left it.
        setIsUnlocked(false);
        return;
      }

      const awayMs = awaySinceRef.current === null ? 0 : Date.now() - awaySinceRef.current;
      const reachedBackground = reachedBackgroundRef.current;
      awaySinceRef.current = null;
      reachedBackgroundRef.current = false;

      // The unlock sheet itself takes the app inactive, and a slow one looks
      // like an app switch. The authentication is the authority there, not this
      // transition, so the gate goes back to what it decided.
      if (authenticationPromiseRef.current !== null) return;
      if (Date.now() - authenticationSettledAtRef.current < APP_SWITCH_RELOCK_GRACE_MS) {
        setIsUnlocked(gateRef.current);
        return;
      }

      // An iPad switcher peek and a quick hop to another app never reach
      // 'background', so elapsed time decides when the transition cannot.
      if (reachedBackground || awayMs >= APP_SWITCH_RELOCK_GRACE_MS) {
        applyGate(false);
        void authenticate();
        return;
      }
      setIsUnlocked(gateRef.current);
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [hydrated, biometricLockEnabled, authenticate, visualQaBiometricBypassEnabled, applyGate]);

  // pre-hydration we treat the gate as engaged for fail-closed safety).
  useEffect(() => {
    if (hydrated && (!biometricLockEnabled || visualQaBiometricBypassEnabled)) {
      applyGate(true);
    }
  }, [hydrated, biometricLockEnabled, visualQaBiometricBypassEnabled, applyGate]);

  if (!hydrated) {
    return {
      isUnlocked: false,
      isReady: false,
      isLocked: true,
      isCovered: false,
      authenticate,
    };
  }

  return {
    isUnlocked: visualQaBiometricBypassEnabled ? true : isUnlocked,
    isReady: true,
    isLocked: visualQaBiometricBypassEnabled ? false : !isUnlocked,
    isCovered: visualQaBiometricBypassEnabled ? false : isCovered,
    authenticate,
  };
}

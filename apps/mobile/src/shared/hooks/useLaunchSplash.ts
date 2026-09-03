import { useEffect, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';

export const LAUNCH_SPLASH_MAX_HOLD_MS = 5000;

export function holdLaunchSplash(): void {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

function releaseLaunchSplash(): void {
  void SplashScreen.hideAsync().catch(() => undefined);
}

export function useLaunchSplashRelease(isReady: boolean): void {
  const releasedRef = useRef(false);

  useEffect(() => {
    if (releasedRef.current) return;

    if (isReady) {
      releasedRef.current = true;
      releaseLaunchSplash();
      return;
    }

    const watchdog = setTimeout(() => {
      if (releasedRef.current) return;
      releasedRef.current = true;
      releaseLaunchSplash();
    }, LAUNCH_SPLASH_MAX_HOLD_MS);

    return () => clearTimeout(watchdog);
  }, [isReady]);
}

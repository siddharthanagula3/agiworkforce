import { useEffect, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';

/**
 * Upper bound on how long the native launch screen is held waiting for the app
 * to become presentable.
 *
 * Without it, any storage/font step that never settles (a rejected MMKV key
 * ceremony that also never resolves, a font source that hangs) would leave the
 * launch image on screen forever with no in-app recovery UI reachable. On
 * expiry we hand off to the app's own loading state instead, which at least
 * renders the themed background and the error paths behind it.
 */
export const LAUNCH_SPLASH_MAX_HOLD_MS = 5000;

/**
 * Keep the native launch screen up past the first React commit.
 *
 * Call this at MODULE scope, before the root component mounts: Expo hides the
 * launch screen automatically as soon as the first frame is drawn, which is
 * earlier than the app can honestly show anything — encrypted storage has not
 * hydrated and the Newsreader faces used by the AGI wordmark have not landed,
 * so the wordmark rendered one frame in a Georgia fallback and then popped.
 */
export function holdLaunchSplash(): void {
  // Rejects when the splash is already gone (fast refresh, a second call).
  // That is not a startup failure, so it must never surface as one.
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

function releaseLaunchSplash(): void {
  void SplashScreen.hideAsync().catch(() => undefined);
}

/**
 * Hide the native launch screen once the app is ready to be looked at, or once
 * {@link LAUNCH_SPLASH_MAX_HOLD_MS} has elapsed — whichever comes first.
 *
 * Releasing is one-way: once hidden we never re-show, so a later `isReady`
 * change cannot flash the launch image back over live UI.
 */
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

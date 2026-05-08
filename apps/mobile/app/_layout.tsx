import { useEffect, useRef, useState } from 'react';
import { useRouter, useSegments, Slot } from 'expo-router';
import { useURL } from 'expo-linking';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
  ToastAndroid,
  Pressable,
  Text,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { useTierStore } from '@/stores/tierStore';
import { supabase } from '@/services/supabase';
import { storage, initMmkvEncryption } from '@/lib/mmkv';
import { hydrateBiometricFlag } from '@/lib/biometricFlagStore';
import { useBiometricGate } from '@/hooks/useBiometricGate';
import { useTheme } from '@/hooks/useTheme';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  handleInitialNotification,
  setNavigatorReady,
  setCurrentSession,
} from '@/services/notifications';
import { getMobileSyncService } from '@/services/conversationSync';
import { registerBackgroundFetch, unregisterBackgroundFetch } from '@/services/backgroundFetch';
import { subscribeToRealtime, unsubscribeFromRealtime } from '@/services/realtime';
import { subscribeToDispatch, unsubscribeFromDispatch } from '@/services/dispatchRealtime';
import { startDesktopStatusPolling } from '@/services/desktopStatus';
import { useChatStore } from '@/stores/chatStore';
import '../global.css';

export default function RootLayout() {
  const [isMmkvReady, setIsMmkvReady] = useState(false);
  const { session, isLoading, isInitialized, initialize } = useAuthStore();
  const refreshTier = useTierStore((s) => s.refreshTier);
  const segments = useSegments();
  const router = useRouter();
  const url = useURL();
  const backPressCount = useRef(0);
  const { colors: themeColors, statusBarStyle } = useTheme();
  const { isUnlocked, authenticate } = useBiometricGate();

  // CRIT-MOB-01 fix (2026-05-04): initialise MMKV encryption on mount, but do
  // NOT call initialize() here. The Supabase session must not be loaded until
  // biometric auth has succeeded. initialize() is called in the effect below
  // that watches `isUnlocked`.
  //
  // LOW-MOB-1 fix (red-team 2026-05): hydrate the biometric-lock flag from
  // SecureStore before any biometric-gated UI mounts. Until hydration
  // completes the gate behaves as if disabled (`enabled = false`); we
  // accept that ~1-frame window because the alternative is a forced lock
  // screen on every cold start regardless of user preference.
  useEffect(() => {
    initMmkvEncryption()
      .then(() => setIsMmkvReady(true))
      .catch((err) => {
        console.warn('[RootLayout] MMKV encryption init failed:', err);
        setIsMmkvReady(true);
      });
    hydrateBiometricFlag().catch((err) => {
      console.warn('[RootLayout] biometric flag hydrate failed:', err);
    });
  }, []);

  // CRIT-MOB-01 fix: call initialize() only after the biometric gate has
  // passed. On first mount isUnlocked is false (when biometric is enabled), so
  // the session is never loaded until the user authenticates.
  useEffect(() => {
    if (!isUnlocked) return;
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked]);

  // LOW-MOB-3 fix (red-team 2026-05): keep notifications.ts informed of
  // the current session so its handler can refuse navigation when no user
  // is signed in. Runs eagerly (not gated by isInitialized) because the
  // notification handler may fire from a cold-start tap before any other
  // effect has run.
  useEffect(() => {
    setCurrentSession(session ?? null);
  }, [session]);

  // Tier refresh — fetch /api/auth/me once after the session is available and
  // persist the result to MMKV-backed tierStore. The persisted value is used
  // immediately on the next cold start so the UI shows the correct tier without
  // waiting for the network call.
  useEffect(() => {
    if (!session || !isInitialized) return;
    refreshTier().catch((err) => {
      console.warn('[RootLayout] Tier refresh failed:', err);
    });
  }, [session, isInitialized, refreshTier]);

  // Tier refresh on app foreground — invalidate cached tier when the user
  // returns to the app (e.g. after completing a subscription upgrade in the
  // browser). Mirrors the model-catalog TTL invalidation pattern.
  useEffect(() => {
    if (!session) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshTier().catch((err) => {
          console.warn('[RootLayout] Foreground tier refresh failed:', err);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [session, refreshTier]);

  // LOW-MOB-3 fix: tell notifications.ts the navigator is mounted. Slot is
  // rendered on every render of this component, so on the first render we
  // know the navigator is up. The retry-loop in safeNavigate is the
  // belt-and-suspenders, but flipping this flag immediately means the
  // first navigation attempts the push directly instead of via setTimeout.
  useEffect(() => {
    setNavigatorReady(true);
    return () => setNavigatorReady(false);
  }, []);

  // Push notifications — register + listeners
  //
  // MOB-1 (audit 2026-05-03): wait for `isInitialized` (MMKV-encryption
  // init + Supabase session resolve) before calling
  // registerForPushNotifications. The previous version fired as soon
  // as `session` was truthy, which could race ahead of the
  // getAuthHeaders() → supabase.auth.getSession() chain returning a
  // valid token. The push token would then be POST'd to the backend
  // with no Authorization header, registering an unauthenticated
  // device record on the user's account.
  useEffect(() => {
    if (!session || !isInitialized) return;

    registerForPushNotifications();
    const removeListeners = setupNotificationListeners();

    // Handle the notification that cold-started the app
    handleInitialNotification();

    return removeListeners;
  }, [session, isInitialized]);

  // Background fetch — register agent status polling on login
  useEffect(() => {
    if (!session) return;

    registerBackgroundFetch().catch((err) => {
      console.warn('[RootLayout] Background fetch registration failed:', err);
    });

    return () => {
      unregisterBackgroundFetch().catch((err) => {
        console.warn('[RootLayout] Background fetch unregister failed:', err);
      });
    };
  }, [session]);

  // Supabase Realtime — cross-surface sync of conversations/messages
  useEffect(() => {
    if (!session) return;

    let unsubscribe: (() => void) | undefined;
    subscribeToRealtime()
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch((err) => {
        console.warn('[RootLayout] Realtime subscription failed:', err);
      });

    return () => {
      unsubscribe?.();
      unsubscribeFromRealtime();
    };
  }, [session]);

  // Dispatch Realtime — desktop→mobile task updates
  useEffect(() => {
    if (!session) return;

    let unsubscribe: (() => void) | undefined;
    subscribeToDispatch()
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch((err) => {
        console.warn('[RootLayout] Dispatch subscription failed:', err);
      });

    return () => {
      unsubscribe?.();
      unsubscribeFromDispatch();
    };
  }, [session]);

  // Desktop liveness polling — catch missed Realtime heartbeat updates
  useEffect(() => {
    if (!session) return;
    const cleanup = startDesktopStatusPolling();
    return cleanup;
  }, [session]);

  // 3-device conversation sync — sync on app resume
  useEffect(() => {
    if (!session) return;

    const syncService = getMobileSyncService();
    syncService.startBackgroundSync(
      () => {
        // Convert local conversations to SyncedConversation shape for merge
        const state = useChatStore.getState();
        return state.conversations.map((c) => ({
          id: c.id,
          user_id: session.user.id,
          title: c.title,
          model: null,
          is_active: true,
          synced_from: 'mobile' as const,
          metadata: null,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          deleted_at: null,
        }));
      },
      () => {
        // Refresh local conversation list after sync completes
        useChatStore.getState().loadConversations();
      },
    );

    return () => {
      syncService.stopBackgroundSync();
    };
  }, [session]);

  // Auth guard + onboarding check
  // P1-8: gate on isMmkvReady so cold start never redirects to /onboarding
  // before the onboarding-done flag has been loaded from encrypted storage.
  useEffect(() => {
    if (!isInitialized || !isMmkvReady) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = (segments[0] as string) === '(public)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone && !inOnboarding) {
        router.replace('/(public)/onboarding');
      } else {
        router.replace('/(app)');
      }
    } else if (session && !inAuthGroup && !inOnboarding) {
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone) {
        router.replace('/(public)/onboarding');
      }
    }
  }, [session, isInitialized, isMmkvReady, segments, router]);

  // C1: Deep linking — handles agiworkforce://pair/CODE and agiworkforce://pair?code=CODE
  // Required for QR desktop pairing when app is backgrounded or closed
  //
  // MOB-2 (audit 2026-05-03): the previous check validated the pairing
  // code regex but allowed ANY URL whose path matched. On Android any
  // app can register a custom scheme — `myapp://pair/XXXXXXXX` would
  // satisfy the test. Universal links over `https://` were not gated at
  // all. We now require either:
  //   1. scheme = `agiworkforce` AND hostname = exactly `pair`, OR
  //   2. scheme = `https` AND hostname = `agiworkforce.com` (universal
  //      link path), with the pair route as the leading segment.
  useEffect(() => {
    if (!url || !session || !isInitialized) return;

    const parsed = Linking.parse(url);
    const scheme = (parsed.scheme ?? '').toLowerCase();
    const hostname = (parsed.hostname ?? '').toLowerCase();
    const path = parsed.path ?? '';
    const segments = path.split('/').filter(Boolean);

    const isCustomSchemePair = scheme === 'agiworkforce' && hostname === 'pair';
    const isUniversalLinkPair =
      scheme === 'https' && hostname === 'agiworkforce.com' && segments[0] === 'pair';

    if (!isCustomSchemePair && !isUniversalLinkPair) return;

    const code =
      (parsed.queryParams?.code as string | undefined) ??
      (isCustomSchemePair ? segments[0] : segments[1]);

    if (code) {
      const PAIRING_CODE_RE = /^[A-Za-z0-9]{8}$/;
      if (!PAIRING_CODE_RE.test(code)) {
        return;
      }
      router.push(`/(app)/companion?pairingCode=${encodeURIComponent(code)}`);
    }
  }, [url, session, isInitialized, router]);

  // CRIT-MOB-01 reset-password handler (red-team fix 2026-05).
  //
  // Background: `authStore.resetPassword` previously asked Supabase to
  // redirect the recovery email to the custom scheme
  // `agiworkforce://reset-password`. Custom schemes are claim-able by any
  // installed APK on Android — a hostile app could intercept the recovery
  // JWT in the URL fragment and seize the account. The redirect is now
  // an HTTPS App Link (`https://agiworkforce.com/auth/reset-password`),
  // which requires verified domain ownership (assetlinks.json + AASA in
  // /.well-known/) so it cannot be hijacked.
  //
  // Two flows that land here:
  //   1. PKCE (preferred) — recovery URL carries `?code=<recoveryCode>` in
  //      query params. We exchange via supabase.auth.exchangeCodeForSession.
  //      The token never appears in the fragment / OS URL bar.
  //   2. Legacy fragment — older Supabase projects emit
  //      `#access_token=<jwt>&refresh_token=<rt>&type=recovery`. We accept
  //      these only when the URL fragment also carries `type=recovery` to
  //      avoid being a generic session-injection sink (an attacker who has
  //      ANY JWT pair can otherwise inject a session by firing a
  //      reset-password URL).
  //
  // We unconditionally accept the URL only when scheme === 'https' AND
  // hostname === 'agiworkforce.com' AND the first path segment is `auth`
  // and the second is `reset-password`. The OS-side App-Link verification
  // is the gate against hijack; this code is the second wall.
  useEffect(() => {
    if (!url || !isInitialized) return;

    const parsed = Linking.parse(url);
    const scheme = (parsed.scheme ?? '').toLowerCase();
    const hostname = (parsed.hostname ?? '').toLowerCase();
    const segments = (parsed.path ?? '').split('/').filter(Boolean);

    const isResetPassword =
      scheme === 'https' &&
      hostname === 'agiworkforce.com' &&
      segments[0] === 'auth' &&
      segments[1] === 'reset-password';
    if (!isResetPassword) return;

    const code = parsed.queryParams?.code;
    const codeStr = typeof code === 'string' ? code : null;

    (async () => {
      if (codeStr) {
        // PKCE path. supabase.auth.exchangeCodeForSession verifies the code
        // against Supabase's auth API; an attacker-supplied or expired code
        // returns an error and we surface it without setting any session.
        const { error } = await supabase.auth.exchangeCodeForSession(codeStr);
        if (error) {
          console.warn('[reset-password] exchangeCodeForSession failed:', error.message);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace('/(auth)/reset-password?recovery=1' as any);
        return;
      }

      // Legacy fragment path. Reject unless type=recovery — keeps this
      // handler from becoming a generic session-injection sink.
      const fragmentMatch = url.match(/#(.*)$/);
      if (!fragmentMatch?.[1]) return;
      const fragmentParams = new URLSearchParams(fragmentMatch[1]);
      if (fragmentParams.get('type') !== 'recovery') {
        console.warn('[reset-password] fragment present without type=recovery; ignoring');
        return;
      }
      const accessToken = fragmentParams.get('access_token');
      const refreshToken = fragmentParams.get('refresh_token');
      if (!accessToken || !refreshToken) return;
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        console.warn('[reset-password] setSession failed:', error.message);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace('/(auth)/reset-password?recovery=1' as any);
    })();
  }, [url, isInitialized, router]);

  // C1b: Share intent handling — receive text/URL shared from other apps
  //
  // HIGH-MOB-03 fix (2026-05-04): shared content is no longer auto-sent to the
  // LLM. We navigate to the share-preview screen where the user reviews and
  // explicitly taps "Send to Chat". The preview screen sanitises the content
  // and enforces the 100 KB length cap.
  useEffect(() => {
    if (!session || !isInitialized) return;

    const handleShare = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (!initialUrl) return;

      // Android share intents come as plain text content, not URLs.
      // expo-linking captures these in the URL query params.
      const parsed = Linking.parse(initialUrl);
      const sharedText =
        (parsed.queryParams?.['android.intent.extra.TEXT'] as string | undefined) ??
        (parsed.queryParams?.text as string | undefined);

      if (sharedText && sharedText.trim()) {
        // Navigate to preview — never auto-send.
        router.push(
          `/(app)/share-preview?text=${encodeURIComponent(sharedText)}` as Parameters<
            typeof router.push
          >[0],
        );
      }
    };

    handleShare();
  }, [session, isInitialized, router]);

  // C2: Android hardware back button — navigate back or double-press to exit
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      if (backPressCount.current === 0) {
        backPressCount.current = 1;
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        setTimeout(() => {
          backPressCount.current = 0;
        }, 2000);
        return true;
      }
      return false; // second press exits
    });

    return () => subscription.remove();
  }, [router]);

  if (!isMmkvReady || !isInitialized || isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: themeColors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={themeColors.teal} size="large" />
      </View>
    );
  }

  if (!isUnlocked) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style={statusBarStyle} />
          <View
            style={{
              flex: 1,
              backgroundColor: themeColors.background,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            <Fingerprint size={48} color={themeColors.teal} />
            <Text style={{ color: themeColors.textPrimary, fontSize: 18, fontWeight: '600' }}>
              Locked
            </Text>
            <Text style={{ color: themeColors.textMuted, fontSize: 14 }}>
              Authenticate to continue
            </Text>
            <Pressable
              onPress={authenticate}
              style={{
                marginTop: 8,
                paddingHorizontal: 24,
                paddingVertical: 12,
                backgroundColor: themeColors.teal,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Unlock</Text>
            </Pressable>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={statusBarStyle} />
        <Slot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

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
  Appearance,
  BackHandler,
  Platform,
  ToastAndroid,
  Pressable,
  Text,
  AppState,
  LogBox,
  type AppStateStatus,
} from 'react-native';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { Fingerprint } from 'lucide-react-native';
import { useAuthStore } from '@/src/features/auth/store';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { storage, initMmkvEncryption } from '@/lib/mmkv';
import { hydrateBiometricFlag } from '@/lib/biometricFlagStore';
import { useBiometricGate } from '@/src/features/auth/hooks/useBiometricGate';
import { useTheme } from '@/src/ui/theme';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { CLERK_PUBLISHABLE_KEY, setClerkTokenGetter } from '@/src/integrations/clerk';
import { FEATURES } from '@/lib/v1FeatureFlags';
import * as Crypto from 'expo-crypto';
import { setUuidV7RandomSource } from '@agiworkforce/utils/uuidv7';
import { startCloudSyncLoop, stopCloudSyncLoop } from '@/services/cloudSyncEngine';

// Inject a CSPRNG for UUIDv7 once at module load. React Native has no global Web
// Crypto, and the cloud sync engine's client-generated ids must never fall back to
// Math.random (a weak RNG would risk cross-device id collisions → silent corruption).
setUuidV7RandomSource((byteCount) => Crypto.getRandomBytes(byteCount));
import {
  registerForPushNotifications,
  setupNotificationListeners,
  handleInitialNotification,
  setNavigatorReady,
  setSignedIn,
} from '@/services/notifications';
import { registerBackgroundFetch, unregisterBackgroundFetch } from '@/services/backgroundFetch';
import { subscribeToRealtime, unsubscribeFromRealtime } from '@/services/realtime';
import { subscribeToDispatch, unsubscribeFromDispatch } from '@/services/dispatchRealtime';
import { startDesktopStatusPolling } from '@/services/desktopStatus';
import { useChatStore } from '@/stores/chatStore';
import { isAgeGateConfirmed } from '@/src/features/auth/services/ageGate';
import { OfflineBanner } from '@/src/features/edge-cases/components/OfflineBanner';
import { CapabilityProvider } from '@/src/lib/capabilities';
import '../global.css';

LogBox.ignoreLogs([
  '[React Native ExecuTorch] No content-length header for ',
  'InteractionManager has been deprecated and will be removed in a future release',
]);

/**
 * Registers Clerk's React `useAuth().getToken()` with the non-React token
 * bridge (lib/clerk.ts) so the cloud streaming path can authenticate against
 * the native AuthView session. Also bridges `isSignedIn` into useAuthStore so
 * that cloud-lifecycle effects in RootLayout (which renders outside
 * <ClerkProvider> and cannot call useAuth() directly) can gate on a real
 * sign-in signal rather than the legacy `session` field (which is always null
 * in v1 because useAuthStore.initialize() never sets it). Must render inside
 * <ClerkProvider>.
 */
function ClerkTokenBridge() {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const setClerkSignedIn = useAuthStore((s) => s.setClerkSignedIn);
  const setClerkLoaded = useAuthStore((s) => s.setClerkLoaded);
  const setCloudAccess = useWaitlistStore((s) => s.setCloudAccess);

  // Propagate Clerk's loaded state first so auth guards never fire during
  // the cold-start window where isSignedIn is false even for signed-in users.
  useEffect(() => {
    if (isLoaded) {
      setClerkLoaded(true);
    }
  }, [isLoaded, setClerkLoaded]);

  useEffect(() => {
    if (isSignedIn) {
      setClerkTokenGetter(
        () => getToken(),
        () => userId ?? null,
        // Force-refresh getter: bypasses the Clerk token cache so the 401-retry
        // path in api.ts receives a freshly-issued JWT rather than the same
        // cached token that was just rejected by the server.
        () => getToken({ skipCache: true }),
      );
      setClerkSignedIn(true);
      // Public alpha: the signed-in entitlement IS the Managed Cloud gate. Reflect it
      // in cloudUnlocked so every UI consumer (mode toggle, model picker, settings)
      // opens Cloud for a signed-in user — no invite, no waitlist.
      setCloudAccess(true);
    } else {
      setClerkTokenGetter(null, null, null);
      setClerkSignedIn(false);
      // Signing out re-locks Cloud access, closing any stale invite-redeemed unlock.
      setCloudAccess(false);
    }
  }, [getToken, userId, isSignedIn, setClerkSignedIn, setCloudAccess]);

  useEffect(() => {
    return () => {
      setClerkTokenGetter(null, null, null);
      useAuthStore.getState().setClerkSignedIn(false);
      useWaitlistStore.getState().setCloudAccess(false);
    };
  }, []);

  return null;
}

export default function RootLayout() {
  const [isMmkvReady, setIsMmkvReady] = useState(false);
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const initialize = useAuthStore((s) => s.initialize);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const authEnabled = FEATURES.auth;
  const refreshTier = useTierStore((s) => s.refreshTier);
  const segments = useSegments();
  const router = useRouter();
  const url = useURL();
  const backPressCount = useRef(0);
  const { colors: themeColors, statusBarStyle } = useTheme();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const localThemeMode = useLocalSettingsStore((s) => s.themeMode);
  const cloudThemeMode = useCloudSettingsStore((s) => s.themeMode);
  const themeMode = isCloud ? cloudThemeMode : localThemeMode;

  // Sync the NATIVE color scheme to the app's theme choice. Clerk's native
  // AuthView (clerk-ios SwiftUI) follows the system/app userInterfaceStyle, so
  // without this it renders light on a light device while the RN UI stays dark.
  // 'system' → null lets native follow the OS; explicit dark/light force it.
  useEffect(() => {
    // 'unspecified' clears the override so native follows the OS (system mode).
    Appearance.setColorScheme(
      themeMode === 'dark' ? 'dark' : themeMode === 'light' ? 'light' : 'unspecified',
    );
  }, [themeMode]);
  // AUDIT-FIX: H-10 — block the navigator tree on `isReady` so the
  // biometric-flag SecureStore read completes before any gated UI renders.
  const { isUnlocked, isReady: isBiometricReady, authenticate } = useBiometricGate();

  // CRIT-MOB-01 fix (2026-05-04): initialise MMKV encryption on mount, but do
  // NOT call initialize() here. Cloud auth state must not be loaded until
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
  // #386: feed the REAL sign-in signal (isClerkSignedIn) — the legacy
  // `session` field is always null in v1, so gating on it routed every
  // notification tap to /(auth)/login and made the deep-link switch unreachable.
  useEffect(() => {
    setSignedIn(isClerkSignedIn);
  }, [isClerkSignedIn]);

  // P2 cloud sync: run the managed-only delta-sync loop while signed in. syncNow()
  // self-gates on cloud mode (no network I/O in Local), so this is safe to keep
  // running; it stops on sign-out / unmount. The sidecar is reset by signOut().
  useEffect(() => {
    if (!isMmkvReady || !isClerkSignedIn) return;
    startCloudSyncLoop();
    return () => stopCloudSyncLoop();
  }, [isMmkvReady, isClerkSignedIn]);

  // Tier refresh — fetch /api/auth/me once after the Clerk session is available
  // and persist the result to MMKV-backed tierStore. The persisted value is used
  // immediately on the next cold start so the UI shows the correct tier without
  // waiting for the network call.
  // #386: gated on isClerkSignedIn (real signal) instead of the legacy
  // useAuthStore.session (always null in v1 — initialize() never sets it).
  useEffect(() => {
    if (!isClerkSignedIn || !isInitialized) return;
    refreshTier().catch((err) => {
      console.warn('[RootLayout] Tier refresh failed:', err);
    });
  }, [isClerkSignedIn, isInitialized, refreshTier]);

  // Tier refresh on app foreground — invalidate cached tier when the user
  // returns to the app (e.g. after completing a subscription upgrade in the
  // browser). Mirrors the model-catalog TTL invalidation pattern.
  useEffect(() => {
    if (!isClerkSignedIn) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshTier().catch((err) => {
          console.warn('[RootLayout] Foreground tier refresh failed:', err);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isClerkSignedIn, refreshTier]);

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
  // init + cloud session resolve) before calling
  // registerForPushNotifications. The previous version fired as soon
  // as `session` was truthy, which could race ahead of the
  // getAuthHeaders() chain returning a
  // valid token. The push token would then be POST'd to the backend
  // with no Authorization header, registering an unauthenticated
  // device record on the user's account.
  // #386: gated on isClerkSignedIn instead of the legacy session (always null).
  // TRUST-BOUNDARY: push token registration is a cloud-account feature.
  // Users in local-model-only mode (cloudChat disabled) should not have a
  // device record created on the backend — push tokens carry account identity
  // and route through Vercel/cloud infrastructure.
  useEffect(() => {
    if (!FEATURES.auth || !FEATURES.cloudChat || !isClerkSignedIn || !isInitialized) return;

    registerForPushNotifications();
    const removeListeners = setupNotificationListeners();

    // Handle the notification that cold-started the app
    handleInitialNotification();

    return removeListeners;
  }, [isClerkSignedIn, isInitialized]);

  // Background fetch — register agent status polling on login
  // #386: gated on isClerkSignedIn instead of the legacy session (always null).
  useEffect(() => {
    if (!FEATURES.dispatch || !isClerkSignedIn) return;

    registerBackgroundFetch().catch((err) => {
      console.warn('[RootLayout] Background fetch registration failed:', err);
    });

    return () => {
      unregisterBackgroundFetch().catch((err) => {
        console.warn('[RootLayout] Background fetch unregister failed:', err);
      });
    };
  }, [isClerkSignedIn]);

  // Cloud realtime — cross-surface sync of conversations/messages
  // #386: gated on isClerkSignedIn instead of the legacy session (always null).
  useEffect(() => {
    if (!FEATURES.cloudChat || !isClerkSignedIn) return;

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
  }, [isClerkSignedIn]);

  // Dispatch Realtime — desktop→mobile task updates
  // #386: gated on isClerkSignedIn instead of the legacy session (always null).
  useEffect(() => {
    if (!FEATURES.dispatch || !isClerkSignedIn) return;

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
  }, [isClerkSignedIn]);

  // Desktop liveness polling — catch missed Realtime heartbeat updates
  // #386: gated on isClerkSignedIn instead of the legacy session (always null).
  useEffect(() => {
    if (!FEATURES.dispatch || !isClerkSignedIn) return;
    const cleanup = startDesktopStatusPolling();
    return cleanup;
  }, [isClerkSignedIn]);

  // NOTE: cross-device conversation sync runs through `cloudSyncEngine`
  // (`startCloudSyncLoop`, wired above). The legacy `conversationSync` facade
  // was a flag-gated dead path and has been removed.

  // Auth guard + onboarding check
  // P1-8: gate on isMmkvReady so cold start never force-redirects to
  // /onboarding before the onboarding-done flag is loaded from encrypted storage.
  useEffect(() => {
    if (!isInitialized || !isMmkvReady) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = (segments[0] as string) === '(public)';
    const inLegal = segments[0] === 'legal';

    // When auth is disabled (legacy local-only build), keep the auth group hidden.
    // In public alpha auth is enabled and signing in is the Managed Cloud entitlement.
    if (!authEnabled) {
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone && !inOnboarding && !inLegal) {
        if (!isAgeGateConfirmed()) {
          router.replace({ pathname: '/(public)/age-gate' as never });
        } else {
          router.replace({ pathname: '/(public)/onboarding' as never });
        }
        return;
      }
      if (onboardingDone && (inAuthGroup || inOnboarding)) {
        router.replace({ pathname: '/(app)' as const });
      }
      return;
    }

    // C2: Block routing while Clerk is still loading to avoid cold-start redirect
    // races. During Clerk's ~200ms init window isClerkSignedIn is false even for a
    // genuinely-signed-in user. The !authEnabled onboarding branch above is NOT
    // gated here — local-only onboarding fires immediately on cold-start.
    if (!isClerkLoaded) return;

    if (!isClerkSignedIn && !inAuthGroup) {
      // Cloud auth (Clerk) is OPTIONAL — Local Mode never forces sign-in (locked
      // rule: Local is the free, account-less hook). Route Local-first; sign-in
      // is reached on demand via the Cloud toggle / invite-redeem flow.
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone && !inOnboarding && !inLegal) {
        router.replace({
          pathname: (isAgeGateConfirmed() ? '/(public)/onboarding' : '/(public)/age-gate') as never,
        });
      } else if (onboardingDone && inOnboarding) {
        router.replace({ pathname: '/(app)' as const });
      }
      // LOCKED RULE (Local-first): a user who is NOT signed in but has completed
      // onboarding must land in the app in LOCAL mode — never on a forced Clerk
      // sign-in wall. This covers both the account-less Local user (the free hook)
      // and a previously-signed-in user whose Cloud session expired: in both cases
      // Local stays fully usable and Cloud sign-in is reached ON DEMAND via the
      // Cloud mode toggle. Previously this branch did
      // `router.replace('/(auth)/login')`, which (with login.tsx's dismissible
      // AuthView routing back to /(app)) trapped Local users in an inescapable
      // login loop after onboarding — a locked-rule / trust-boundary violation.
      // Root index (app/index.tsx) already routes onboarding-done users to /(app),
      // so we intentionally do nothing here and let them stay in Local.
    } else if (isClerkSignedIn && inAuthGroup) {
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone && !inOnboarding) {
        // Age-gate must come before onboarding on first run.
        if (!isAgeGateConfirmed()) {
          router.replace({ pathname: '/(public)/age-gate' as never });
        } else {
          router.replace({ pathname: '/(public)/onboarding' as never });
        }
      } else {
        router.replace({ pathname: '/(app)' as const });
      }
    } else if (isClerkSignedIn && inOnboarding) {
      // User landed in onboarding with an active session (e.g. OAuth callback).
      // If they already completed onboarding on a prior launch, go straight to
      // the app so they never see the welcome carousel again.
      const onboardingDone = storage.getString('onboarding-done');
      if (onboardingDone) {
        router.replace({ pathname: '/(app)' as const });
      }
    } else if (isClerkSignedIn && !inAuthGroup && !inOnboarding) {
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone) {
        if (!isAgeGateConfirmed()) {
          router.replace({ pathname: '/(public)/age-gate' as never });
        } else {
          router.replace({ pathname: '/(public)/onboarding' as never });
        }
      }
    }
  }, [isClerkSignedIn, isClerkLoaded, isInitialized, isMmkvReady, segments, router, authEnabled]);

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
    if (!FEATURES.companion || !FEATURES.dispatch) return;

    const code =
      (parsed.queryParams?.code as string | undefined) ??
      (isCustomSchemePair ? segments[0] : segments[1]);

    if (code) {
      // AUDIT-FIX: H-12 — accept the new 12-char pairing codes while still
      // recognising legacy 8-char codes during the rollout window so users
      // mid-pairing aren't bricked. Drop the 8-char branch once desktop ships
      // the 12-char generator everywhere.
      const PAIRING_CODE_RE = /^[A-Za-z0-9]{12}$|^[A-Za-z0-9]{8}$/;
      if (!PAIRING_CODE_RE.test(code)) {
        return;
      }
      router.push({ pathname: '/(app)/companion' as const, params: { pairingCode: code } });
    }
  }, [url, session, isInitialized, router]);

  // Password reset links are handled by the Web/Clerk account surface.
  // Mobile keeps this route gate only to avoid treating account links as
  // pairing/share links.
  useEffect(() => {
    if (!FEATURES.auth || !url || !isInitialized) return;

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
    router.replace({ pathname: '/(auth)/reset-password' as const });
  }, [url, isInitialized, router]);

  // C1b: Share intent handling — receive text/URL shared from other apps
  //
  // HIGH-MOB-03 fix (2026-05-04): shared content is no longer auto-sent to the
  // LLM. We navigate to the share-preview screen where the user reviews and
  // explicitly taps "Send to Chat". The preview screen sanitises the content
  // and enforces the 100 KB length cap.
  // #386: share-to-chat is a LOCAL-first feature and must not depend on the
  // always-null `session` (that gate made external shares silently no-op).
  // Gate only on app readiness.
  useEffect(() => {
    if (!isInitialized) return;

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
  }, [isInitialized, router]);

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

  // AUDIT-FIX: H-10 — keep the splash up until the biometric-flag has
  // hydrated. Without this we'd briefly render the navigator while the
  // gate was indeterminate.
  if (!isMmkvReady || !isInitialized || isLoading || !isBiometricReady) {
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
              <Text style={{ color: themeColors.accentText, fontWeight: '600' }}>Unlock</Text>
            </Pressable>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkTokenBridge />
      <CapabilityProvider platform="mobile">
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <StatusBar style={statusBarStyle} />
            <Slot />
            {/* Global offline banner — renders above all content when NetInfo is offline */}
            <OfflineBanner />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </CapabilityProvider>
    </ClerkProvider>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSegments, Slot } from 'expo-router';
import { useLinkingURL } from 'expo-linking';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { reloadAppAsync } from 'expo';
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
import { useFonts } from 'expo-font';
import { Newsreader_500Medium, Newsreader_600SemiBold } from '@expo-google-fonts/newsreader';
import { useAuthStore } from '@/src/features/auth/store';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { clearLocalCloudAccountState } from '@/src/features/auth/services/cloudAccountTeardown';
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  beginPushTokenAccountSession,
  clearPushTokenAccountSession,
} from '@/src/features/auth/services/pushTokenAccountLifecycle';
import { storage, initMmkvEncryption } from '@/lib/mmkv';
import { hydrateBiometricFlag } from '@/lib/biometricFlagStore';
import { useBiometricGate } from '@/src/features/auth/hooks/useBiometricGate';
import { ThemeVars, useTheme } from '@/src/ui/theme';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import {
  CLERK_NATIVE_AUTH_OPTIONS,
  CLERK_PUBLISHABLE_KEY,
  setClerkTokenGetter,
} from '@/src/integrations/clerk';
import { FEATURES } from '@/lib/v1FeatureFlags';
import * as Crypto from 'expo-crypto';
import { setUuidV7RandomSource } from '@agiworkforce/utils/uuidv7';
import { startCloudSyncLoop, stopCloudSyncLoop, syncNow } from '@/services/cloudSyncEngine';
import { getAuthToken } from '@/services/authSession';
import { isAgiWorkforceUniversalLinkHost } from '@/src/integrations/universalLinks';
import { restoreStoredLanguage } from '@/src/i18n';
import { subscribeToIOSShareInbox } from '@/src/features/share-preview/iosShareInbox';
import { clearPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { completePendingPostAuthIntentForLoadedSession } from '@/src/features/auth/actions/postAuthIntent';

// Expo Router only wires up a route's error boundary when the route file
// itself has a named `ErrorBoundary` export — a separate ./error.tsx file is
// otherwise just an ordinary, unreachable screen. RootErrorBoundary already
// has the full App-Store-resilience UI (retry / go back); re-export it here
// under the name Expo Router looks for so it actually fires.
export { default as ErrorBoundary } from './error';

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
import { useChatStore } from '@/stores/chatStore';
import { isAgeGateConfirmed } from '@/src/features/auth/services/ageGate';
import { OfflineBanner } from '@/src/features/edge-cases/components/OfflineBanner';
import { CapabilityProvider } from '@/src/lib/capabilities';
import { holdLaunchSplash, useLaunchSplashRelease } from '@/src/shared/hooks/useLaunchSplash';
import '../global.css';

// Module scope, not an effect: Expo tears the native launch screen down at the
// first drawn frame, which is before encrypted storage has hydrated and before
// the Newsreader faces have landed. Holding it here and releasing it below
// keeps the launch screen up until the first in-app frame is the real one.
holdLaunchSplash();

LogBox.ignoreLogs([
  '[React Native ExecuTorch] No content-length header for ',
  'InteractionManager has been deprecated and will be removed in a future release',
  // Dev-only noise: these are expected in development builds and ship correctly
  // (release uses Clerk pk_live). Suppressing the LogBox banner only — the
  // warnings still print to the Metro console for triage. The banner otherwise
  // overlaps the bottom composer/CTA, hiding a real control during dev/QA.
  'Clerk: Clerk has been loaded with development keys',
  'Ignoring DevTools app debug target',
]);

let backgroundFetchLifecycle: Promise<void> = Promise.resolve();

/**
 * Serialize OS background-task ownership changes.
 *
 * React runs account-A cleanup before account-B's effect, but both native
 * register/unregister calls are asynchronous. Without a queue, B can observe
 * the task as still registered and return, followed by A's late unregister —
 * leaving B with no background task at all.
 */
function queueBackgroundFetchLifecycle(operation: () => Promise<void>): Promise<void> {
  const transition = backgroundFetchLifecycle.catch(() => undefined).then(operation);
  backgroundFetchLifecycle = transition;
  return transition;
}

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
  const { getToken, userId, isSignedIn, isLoaded } = useAuth(CLERK_NATIVE_AUTH_OPTIONS);
  const setClerkSignedIn = useAuthStore((s) => s.setClerkSignedIn);
  const setClerkUserId = useAuthStore((s) => s.setClerkUserId);
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
    if (!isLoaded) return;
    if (isSignedIn) {
      if (!userId) {
        // A signed-in state without a stable Clerk owner cannot safely adopt
        // persisted Cloud caches. Wait for the identity-bearing render.
        return;
      }
      const owner = activateCloudAccount(userId);
      if (owner.changed) {
        clearLocalCloudAccountState();
        // Teardown stops account A's interval. Keep a fresh account-B loop
        // armed; its immediate call no-ops while the fail-closed mode is Local.
        startCloudSyncLoop();
      }
      setClerkTokenGetter(
        () => getToken(),
        () => userId ?? null,
        // Force-refresh getter: bypasses the Clerk token cache so the 401-retry
        // path in api.ts receives a freshly-issued JWT rather than the same
        // cached token that was just rejected by the server.
        () => getToken({ skipCache: true }),
      );
      setClerkUserId(userId);
      // Public alpha: the signed-in entitlement IS the Managed Cloud gate. Reflect it
      // in cloudUnlocked so every UI consumer (mode toggle, model picker, settings)
      // opens Cloud for a signed-in user — no invite, no waitlist.
      setCloudAccess(true);
      // Consume the transient intent only after Clerk has confirmed the owner and
      // Cloud access is unlocked (model-store selection validates that gate), but
      // before publishing isClerkSignedIn. The auth guard redirects on that final
      // signal, so the first app frame already has the requested mode + catalog
      // default model instead of flashing/falling back to Local.
      completePendingPostAuthIntentForLoadedSession({
        isLoaded,
        isSignedIn,
        userId,
        cloudUnlocked: useWaitlistStore.getState().cloudUnlocked,
        subscriptionTier: useTierStore.getState().tier,
      });
      setClerkSignedIn(true);
    } else {
      clearPostAuthIntent();
      setClerkTokenGetter(null, null, null);
      setClerkUserId(null);
      setClerkSignedIn(false);
      invalidateCloudAccount();
      // Clerk can expire or revoke a session without the explicit auth-store
      // signOut action running. Once Clerk has definitively loaded signed-out,
      // fail the persisted privacy boundary back to Local as well. The
      // `if (!isLoaded) return` guard above prevents a cold-start pending state
      // from changing the user's mode prematurely.
      // Signing out re-locks Cloud access, closing any stale invite-redeemed unlock.
      setCloudAccess(false);
      // Session expiry/revocation does not pass through authStore.signOut().
      // Use the same network-free, idempotent teardown so account B can never
      // inherit account A's Cloud chats, artifacts, memories, projects,
      // personalization, sync cursors, plan grants, or connector badges.
      clearLocalCloudAccountState();
    }
  }, [getToken, userId, isLoaded, isSignedIn, setClerkSignedIn, setClerkUserId, setCloudAccess]);

  useEffect(() => {
    return () => {
      clearPostAuthIntent();
      setClerkTokenGetter(null, null, null);
      useAuthStore.getState().setClerkUserId(null);
      useAuthStore.getState().setClerkSignedIn(false);
      useWaitlistStore.getState().setCloudAccess(false);
    };
  }, []);

  return null;
}

export default function RootLayout() {
  // The AGI wordmark is set in Newsreader, the brand typeface. Loading it here
  // (rather than per-screen) means every surface that renders the lockup gets
  // the real face instead of a Georgia fallback. Render is NOT blocked on it:
  // a missing font must never gate the app, and RN falls back until it lands.
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_500Medium,
    Newsreader_600SemiBold,
  });
  const [isMmkvReady, setIsMmkvReady] = useState(false);

  // Release the native launch screen only once the first React frame will be
  // the real one: encrypted storage hydrated AND the brand faces resolved. A
  // font FAILURE counts as resolved — a missing typeface must never gate the
  // app, it just falls back, which is the same contract as the render below.
  useLaunchSplashRelease(isMmkvReady && (fontsLoaded || fontError !== null));
  const isLoading = useAuthStore((s) => s.isLoading);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const initialize = useAuthStore((s) => s.initialize);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const authEnabled = FEATURES.auth;
  const refreshTier = useTierStore((s) => s.refreshTier);
  const segments = useSegments();
  const router = useRouter();
  // `useURL()` (RNLinking 'url' NativeEventEmitter) only reliably fires for the
  // URL that launched the process — subsequent deep-link opens while the app is
  // already running are silently dropped. `useLinkingURL()` (ExpoLinking's
  // 'onURLReceived' channel — the same one expo-router's own linking resolver
  // uses) fires on every open, including pair/reset-password/App-Intents links
  // arriving while the app is foregrounded. Discovered via reproducible
  // simulator testing of the App Intents deep-link handler below.
  const url = useLinkingURL();
  const backPressCount = useRef(0);
  const { colors: themeColors, statusBarStyle } = useTheme();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const previousIsCloudRef = useRef(isCloud);
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
      .then(async () => {
        const language = await restoreStoredLanguage();
        if (language.directionChanged) {
          // reloadAppAsync works in release and debug builds. If a host still
          // declines it, keep startup usable; the persisted direction applies
          // the next time the app opens.
          void reloadAppAsync('Apply stored app language direction').catch((err) => {
            console.warn('[RootLayout] app-language direction reload failed:', err);
            setIsMmkvReady(true);
          });
          return;
        }
        setIsMmkvReady(true);
      })
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
    if (!isMmkvReady || !isClerkSignedIn || !clerkUserId) return;
    startCloudSyncLoop();
    return () => stopCloudSyncLoop();
  }, [isMmkvReady, isClerkSignedIn, clerkUserId]);

  // Tier refresh — fetch /api/me once after the Clerk session is available
  // and persist the result to MMKV-backed tierStore. The persisted value is used
  // immediately on the next cold start so the UI shows the correct tier without
  // waiting for the network call.
  // #386: gated on isClerkSignedIn (real signal) instead of the legacy
  // useAuthStore.session (always null in v1 — initialize() never sets it).
  useEffect(() => {
    if (!isClerkSignedIn || !clerkUserId || !isInitialized) return;
    refreshTier().catch((err) => {
      console.warn('[RootLayout] Tier refresh failed:', err);
    });
  }, [isClerkSignedIn, clerkUserId, isInitialized, refreshTier]);

  // Tier refresh on app foreground — invalidate cached tier when the user
  // returns to the app (e.g. after completing a subscription upgrade in the
  // browser). Mirrors the model-catalog TTL invalidation pattern.
  useEffect(() => {
    if (!isClerkSignedIn || !clerkUserId) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshTier().catch((err) => {
          console.warn('[RootLayout] Foreground tier refresh failed:', err);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isClerkSignedIn, clerkUserId, refreshTier]);

  // Tier refresh on Local -> Cloud mode entry. The app always launches into
  // Local mode, so the sign-in+init refresh above fires while `/api/me` is
  // still blocked by guardedFetch's egress guard (Local mode must never call
  // our-cloud hosts) — it fails silently and the cached/default tier ('free')
  // sticks. Without this effect, tier only ever gets a real chance to refresh
  // if the user happens to background/foreground the app (the effect above)
  // or visit Settings > Billing (which had its own local copy of this same
  // check — see cloud-billing/index.tsx). A signed-in Pro/Max user who
  // switches to Cloud and just starts chatting would keep seeing free-tier
  // model presets and gates for the entire session despite being entitled.
  useEffect(() => {
    const enteredCloud = isCloud && !previousIsCloudRef.current;
    previousIsCloudRef.current = isCloud;
    if (!isClerkSignedIn || !clerkUserId || !isCloud) return;
    refreshTier().catch((err) => {
      console.warn('[RootLayout] Cloud-mode-entry tier refresh failed:', err);
    });
    // The periodic loop starts while the app is Local and its immediate pull
    // correctly no-ops. Do not make users wait for the next 30s tick after
    // explicitly entering Cloud. On a persisted-Cloud cold start, enteredCloud
    // is false and startCloudSyncLoop owns the single initial pull; on a real
    // Local→Cloud transition this call is immediate. syncNow itself is
    // single-flight, so a hydration-time transition cannot duplicate a pull.
    if (enteredCloud && isMmkvReady) void syncNow();
  }, [isClerkSignedIn, clerkUserId, isCloud, isMmkvReady, refreshTier]);

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
    if (
      !FEATURES.auth ||
      !FEATURES.cloudChat ||
      !isClerkSignedIn ||
      !clerkUserId ||
      !isInitialized
    ) {
      if (isInitialized && (!isClerkSignedIn || !clerkUserId)) {
        void clearPushTokenAccountSession().catch((err) => {
          console.warn('[RootLayout] Push-token account cleanup failed:', err);
        });
      }
      return;
    }

    let disposed = false;
    let removeListeners: (() => void) | undefined;
    void beginPushTokenAccountSession(clerkUserId, getAuthToken)
      .then(async (accountContext) => {
        if (!accountContext || disposed || !accountContext.isCurrent()) return;
        // Registration is managed-cloud egress. Bind/cache the Clerk owner in
        // every signed-in mode so A can be deleted during a direct A -> B
        // switch, but only POST B's device row while the user is in Cloud.
        if (!isCloud) return;
        await registerForPushNotifications(accountContext);
        if (disposed || !accountContext.isCurrent()) return;

        removeListeners = setupNotificationListeners(accountContext);
        await handleInitialNotification();
      })
      .catch((err) => {
        if (!disposed) {
          console.warn('[RootLayout] Push notification setup failed:', err);
        }
      });

    return () => {
      disposed = true;
      removeListeners?.();
    };
  }, [isClerkSignedIn, clerkUserId, isCloud, isInitialized]);

  // Background fetch — register agent status polling on login
  // #386: gated on isClerkSignedIn instead of the legacy session (always null).
  useEffect(() => {
    if (!FEATURES.dispatch || !isClerkSignedIn || !clerkUserId) return;

    let disposed = false;
    const ownerId = clerkUserId;
    void queueBackgroundFetchLifecycle(async () => {
      // Establish one deterministic OS-task state for this owner. This also
      // recovers if the previous process died between registration and cleanup.
      await unregisterBackgroundFetch();
      if (
        disposed ||
        useAuthStore.getState().clerkUserId !== ownerId ||
        !useAuthStore.getState().isClerkSignedIn
      ) {
        return;
      }
      await registerBackgroundFetch();
    }).catch((err) => {
      if (!disposed) {
        console.warn('[RootLayout] Background fetch registration failed:', err);
      }
    });

    return () => {
      disposed = true;
      void queueBackgroundFetchLifecycle(() => unregisterBackgroundFetch()).catch((err) => {
        console.warn('[RootLayout] Background fetch unregister failed:', err);
      });
    };
  }, [isClerkSignedIn, clerkUserId]);

  // Cloud realtime — cross-surface sync of conversations/messages
  // #386: gated on isClerkSignedIn instead of the legacy session (always null).
  useEffect(() => {
    if (!FEATURES.cloudChat || !isClerkSignedIn || !clerkUserId) return;

    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    subscribeToRealtime()
      .then((unsub) => {
        if (disposed) {
          unsub();
          return;
        }
        unsubscribe = unsub;
      })
      .catch((err) => {
        console.warn('[RootLayout] Realtime subscription failed:', err);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
      unsubscribeFromRealtime();
    };
  }, [isClerkSignedIn, clerkUserId]);

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
  //   2. scheme = `https` AND hostname is one of the two verified AGI
  //      domains, with the pair route as the leading segment.
  //
  // #386: gated on isClerkSignedIn instead of the legacy session, which
  // `useAuthStore.initialize()` never assigns — it is null for the life of the
  // process, so this effect returned on its first line for every URL. That
  // killed the deep-link route only: an `agiworkforce://pair/...` tap and an
  // `https://agiworkforce.com/pair...` App Link / Universal Link tap. It did
  // NOT affect QR scanning (the QR carries the gateway's `agiw:<code>:<token>`
  // payload, parsed by the in-app scanner) or manual entry (the companion
  // screen's own input) — neither goes through here.
  useEffect(() => {
    if (!url || !isClerkSignedIn || !isInitialized) return;

    const parsed = Linking.parse(url);
    const scheme = (parsed.scheme ?? '').toLowerCase();
    const hostname = (parsed.hostname ?? '').toLowerCase();
    const path = parsed.path ?? '';
    const segments = path.split('/').filter(Boolean);

    const isCustomSchemePair = scheme === 'agiworkforce' && hostname === 'pair';
    const isUniversalLinkPair =
      scheme === 'https' &&
      isAgiWorkforceUniversalLinkHost(hostname) &&
      segments[0] === 'pair' &&
      segments.length <= 2;

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
  }, [url, isClerkSignedIn, isInitialized, router]);

  // Import iOS Share Extension drafts from the supported App Group handoff.
  // Share extensions cannot reliably launch their containing app, so the
  // extension saves only after a native preview and this authenticated app
  // foreground provides the second review before any model send.
  useEffect(() => {
    if (!isInitialized || !isClerkSignedIn) return;
    return subscribeToIOSShareInbox(
      ({ text, truncated }) => {
        router.push(
          `/(app)/share-preview?text=${encodeURIComponent(text)}${
            truncated ? '&nativeTruncated=1' : ''
          }` as Parameters<typeof router.push>[0],
        );
      },
      (error) => {
        console.warn('[RootLayout] Could not import iOS shared content:', error);
      },
    );
  }, [isInitialized, isClerkSignedIn, router]);

  // C1c: App Intents / Siri deep links — agiworkforce://intent/<verb>?<params>.
  // AGIIntentDispatch invokes this seam for Siri, Spotlight, and Shortcuts.
  // On Android, MainActivity.kt rewrites external shares (ACTION_SEND) and
  // selected-text actions (ACTION_PROCESS_TEXT) onto the same seam as the
  // 'share' verb. `useLinkingURL()` covers both cold start and warm handoff.
  // Text-bearing verbs route through the existing share-preview review screen
  // (HIGH-MOB-03) so shared text or a Siri mis-transcription is never
  // auto-sent to the model without the user seeing it first.
  useEffect(() => {
    if (!url || !isInitialized) return;

    const parsed = Linking.parse(url);
    const scheme = (parsed.scheme ?? '').toLowerCase();
    const hostname = (parsed.hostname ?? '').toLowerCase();
    if (scheme !== 'agiworkforce' || hostname !== 'intent') return;

    const segments = (parsed.path ?? '').split('/').filter(Boolean);
    const verb = segments[0];
    const queryParams = parsed.queryParams ?? {};
    const getParam = (key: string): string | undefined => {
      const value = queryParams[key];
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    };

    switch (verb) {
      case 'chat':
        router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
        break;
      case 'ask': {
        const prompt = getParam('prompt');
        if (prompt) {
          router.push(
            `/(app)/share-preview?text=${encodeURIComponent(prompt)}` as Parameters<
              typeof router.push
            >[0],
          );
        } else {
          router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
        }
        break;
      }
      case 'summarize': {
        const text = getParam('text');
        if (text) {
          router.push(
            `/(app)/share-preview?text=${encodeURIComponent(
              `Summarize this:\n\n${text}`,
            )}` as Parameters<typeof router.push>[0],
          );
        }
        break;
      }
      case 'remind': {
        const reminder = getParam('reminder');
        const due = getParam('due');
        if (reminder) {
          if (Platform.OS === 'ios') {
            router.push(
              `/(app)/reminder-review?title=${encodeURIComponent(reminder)}${
                due ? `&due=${encodeURIComponent(due)}` : ''
              }` as Parameters<typeof router.push>[0],
            );
          } else {
            const dueDate = due ? new Date(due) : null;
            const dueLabel =
              dueDate && Number.isFinite(dueDate.getTime()) ? dueDate.toLocaleString() : null;
            const message = dueLabel
              ? `Remind me to ${reminder} at ${dueLabel}`
              : `Remind me to ${reminder}`;
            router.push(
              `/(app)/share-preview?text=${encodeURIComponent(message)}` as Parameters<
                typeof router.push
              >[0],
            );
          }
        }
        break;
      }
      case 'share': {
        // Android share sheet/text selection, rewritten by MainActivity.kt.
        const text = getParam('text');
        const nativeTruncated = getParam('truncated') === '1';
        if (text && text.trim()) {
          router.push(
            `/(app)/share-preview?text=${encodeURIComponent(text)}${
              nativeTruncated ? '&nativeTruncated=1' : ''
            }` as Parameters<typeof router.push>[0],
          );
        }
        break;
      }
      case 'translate': {
        const text = getParam('text');
        const targetLanguage = getParam('targetLanguage');
        router.push({
          pathname: '/(app)/translate' as const,
          params: {
            ...(text ? { text } : {}),
            ...(targetLanguage ? { targetLanguage } : {}),
          },
        });
        break;
      }
      case 'scan':
        // Siri-supplied image URIs aren't forwarded yet — opens the in-app scan
        // capture flow. Forwarding the URI requires wiring external-URI ingestion
        // into app/(app)/scan.tsx (tracked as follow-up).
        router.push('/(app)/scan' as Parameters<typeof router.push>[0]);
        break;
      case 'analyze_image':
        // Same limitation as 'scan' — opens the capture flow, doesn't yet forward
        // the IntentFile URI Siri staged.
        router.push('/(app)/camera' as Parameters<typeof router.push>[0]);
        break;
      case 'transcribe':
        // Opens the voice flow; doesn't yet forward the staged audio file URI.
        router.push('/(app)/voice' as Parameters<typeof router.push>[0]);
        break;
      default:
        break;
    }
  }, [url, isInitialized, router]);

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
      isAgiWorkforceUniversalLinkHost(hostname) &&
      segments[0] === 'auth' &&
      segments[1] === 'reset-password' &&
      segments.length === 2;
    if (!isResetPassword) return;
    router.replace({ pathname: '/(auth)/reset-password' as const });
  }, [url, isInitialized, router]);

  // NOTE: Android external shares are handled by the C1c 'share' verb above.
  // iOS shares use the separate App Group inbox effect before this handler.

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
            {/* Publishes the resolved palette to NativeWind, so class-styled
                screens follow the theme instead of the dark constants Tailwind
                compiled in. Must wrap Slot, not sit beside it. */}
            <ThemeVars>
              <Slot />
            </ThemeVars>
            {/* Global offline banner — renders above all content when NetInfo is offline */}
            <OfflineBanner />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </CapabilityProvider>
    </ClerkProvider>
  );
}

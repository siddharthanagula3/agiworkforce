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

export { default as ErrorBoundary } from './error';

setUuidV7RandomSource((byteCount) => Crypto.getRandomBytes(byteCount));
import {
  registerForPushNotifications,
  setupNotificationListeners,
  handleInitialNotification,
  setNavigatorReady,
  setSignedIn,
} from '@/services/notifications';
import { registerBackgroundFetch, unregisterBackgroundFetch } from '@/services/backgroundFetch';
import { useChatStore } from '@/stores/chatStore';
import { isAgeGateConfirmed } from '@/src/features/auth/services/ageGate';
import { CLOUD_SIGN_IN_RETURN_PATH } from './(public)/age-gate';
import { OfflineBanner } from '@/src/features/edge-cases/components/OfflineBanner';
import { CapabilityProvider } from '@/src/lib/capabilities';
import { holdLaunchSplash, useLaunchSplashRelease } from '@/src/shared/hooks/useLaunchSplash';
import '../global.css';

holdLaunchSplash();

LogBox.ignoreLogs([
  '[React Native ExecuTorch] No content-length header for ',
  'InteractionManager has been deprecated and will be removed in a future release',
  'Clerk: Clerk has been loaded with development keys',
  'Ignoring DevTools app debug target',
]);

let backgroundFetchLifecycle: Promise<void> = Promise.resolve();

function queueBackgroundFetchLifecycle(operation: () => Promise<void>): Promise<void> {
  const transition = backgroundFetchLifecycle.catch(() => undefined).then(operation);
  backgroundFetchLifecycle = transition;
  return transition;
}

function ClerkTokenBridge() {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth(CLERK_NATIVE_AUTH_OPTIONS);
  const setClerkSignedIn = useAuthStore((s) => s.setClerkSignedIn);
  const setClerkUserId = useAuthStore((s) => s.setClerkUserId);
  const setClerkLoaded = useAuthStore((s) => s.setClerkLoaded);
  const setCloudAccess = useWaitlistStore((s) => s.setCloudAccess);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      if (!userId) {
        return;
      }
      const owner = activateCloudAccount(userId);
      if (owner.changed) {
        clearLocalCloudAccountState();
        startCloudSyncLoop();
      }
      setClerkTokenGetter(
        () => getToken(),
        () => userId ?? null,
        () => getToken({ skipCache: true }),
      );
      setClerkUserId(userId);
      setCloudAccess(true);
      completePendingPostAuthIntentForLoadedSession({
        isLoaded,
        isSignedIn,
        userId,
        cloudUnlocked: useWaitlistStore.getState().cloudUnlocked,
        subscriptionTier: useTierStore.getState().tier,
      });
      setClerkSignedIn(true);
      setClerkLoaded(true);
    } else {
      clearPostAuthIntent();
      setClerkTokenGetter(null, null, null);
      setClerkUserId(null);
      setClerkSignedIn(false);
      invalidateCloudAccount();
      setCloudAccess(false);
      clearLocalCloudAccountState();
      setClerkLoaded(true);
    }
  }, [
    getToken,
    userId,
    isLoaded,
    isSignedIn,
    setClerkLoaded,
    setClerkSignedIn,
    setClerkUserId,
    setCloudAccess,
  ]);

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
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_500Medium,
    Newsreader_600SemiBold,
  });
  const [isMmkvReady, setIsMmkvReady] = useState(false);

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
  const url = useLinkingURL();
  const backPressCount = useRef(0);
  const { colors: themeColors, statusBarStyle } = useTheme();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const previousIsCloudRef = useRef(isCloud);
  const localThemeMode = useLocalSettingsStore((s) => s.themeMode);
  const cloudThemeMode = useCloudSettingsStore((s) => s.themeMode);
  const themeMode = isCloud ? cloudThemeMode : localThemeMode;

  useEffect(() => {
    Appearance.setColorScheme(
      themeMode === 'dark' ? 'dark' : themeMode === 'light' ? 'light' : 'unspecified',
    );
  }, [themeMode]);
  const { isUnlocked, isReady: isBiometricReady, authenticate } = useBiometricGate();

  useEffect(() => {
    initMmkvEncryption()
      .then(async () => {
        const language = await restoreStoredLanguage();
        if (language.directionChanged) {
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

  useEffect(() => {
    if (!isUnlocked) return;
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked]);

  useEffect(() => {
    setSignedIn(isClerkSignedIn);
  }, [isClerkSignedIn]);

  useEffect(() => {
    if (!isMmkvReady || !isClerkSignedIn || !clerkUserId) return;
    startCloudSyncLoop();
    return () => stopCloudSyncLoop();
  }, [isMmkvReady, isClerkSignedIn, clerkUserId]);

  useEffect(() => {
    if (!isClerkSignedIn || !clerkUserId || !isInitialized) return;
    refreshTier().catch((err) => {
      console.warn('[RootLayout] Tier refresh failed:', err);
    });
  }, [isClerkSignedIn, clerkUserId, isInitialized, refreshTier]);

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

  useEffect(() => {
    const enteredCloud = isCloud && !previousIsCloudRef.current;
    previousIsCloudRef.current = isCloud;
    if (!isClerkSignedIn || !clerkUserId || !isCloud) return;
    refreshTier().catch((err) => {
      console.warn('[RootLayout] Cloud-mode-entry tier refresh failed:', err);
    });
    if (enteredCloud && isMmkvReady) void syncNow();
  }, [isClerkSignedIn, clerkUserId, isCloud, isMmkvReady, refreshTier]);

  useEffect(() => {
    setNavigatorReady(true);
    return () => setNavigatorReady(false);
  }, []);

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

  useEffect(() => {
    if (!FEATURES.dispatch || !isClerkSignedIn || !clerkUserId) return;

    let disposed = false;
    const ownerId = clerkUserId;
    void queueBackgroundFetchLifecycle(async () => {
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

  useEffect(() => {
    if (!isInitialized || !isMmkvReady) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = (segments[0] as string) === '(public)';
    const inLegal = segments[0] === 'legal';

    if (!authEnabled) {
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone && !inOnboarding && !inLegal) {
        router.replace({ pathname: '/(public)/onboarding' as never });
        return;
      }
      if (onboardingDone && (inAuthGroup || inOnboarding)) {
        router.replace({ pathname: '/(app)' as const });
      }
      return;
    }

    if (!isClerkLoaded) return;

    if (!isClerkSignedIn && inAuthGroup && !isAgeGateConfirmed()) {
      router.replace({
        pathname: '/(public)/age-gate' as never,
        params: { returnTo: CLOUD_SIGN_IN_RETURN_PATH },
      } as never);
      return;
    }

    if (!isClerkSignedIn && !inAuthGroup) {
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone && !inOnboarding && !inLegal) {
        router.replace({ pathname: '/(public)/onboarding' as never });
      } else if (onboardingDone && inOnboarding) {
        router.replace({ pathname: '/(app)' as const });
      }
    } else if (isClerkSignedIn && inAuthGroup) {
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone && !inOnboarding) {
        if (!isAgeGateConfirmed()) {
          router.replace({ pathname: '/(public)/age-gate' as never });
        } else {
          router.replace({ pathname: '/(public)/onboarding' as never });
        }
      } else {
        router.replace({ pathname: '/(app)' as const });
      }
    } else if (isClerkSignedIn && inOnboarding) {
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
      const PAIRING_CODE_RE = /^[A-Za-z0-9]{12}$|^[A-Za-z0-9]{8}$/;
      if (!PAIRING_CODE_RE.test(code)) {
        return;
      }
      router.push({ pathname: '/(app)/companion' as const, params: { pairingCode: code } });
    }
  }, [url, isClerkSignedIn, isInitialized, router]);

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
        router.push('/(app)/scan' as Parameters<typeof router.push>[0]);
        break;
      case 'analyze_image':
        router.push('/(app)/camera' as Parameters<typeof router.push>[0]);
        break;
      case 'transcribe':
        router.push('/(app)/voice' as Parameters<typeof router.push>[0]);
        break;
      default:
        break;
    }
  }, [url, isInitialized, router]);

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
      return false;
    });

    return () => subscription.remove();
  }, [router]);

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
            {/* Global offline banner, renders above all content when NetInfo is offline */}
            <OfflineBanner />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </CapabilityProvider>
    </ClerkProvider>
  );
}

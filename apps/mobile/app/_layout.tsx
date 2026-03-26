import { useEffect, useRef } from 'react';
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
} from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { storage, initMmkvEncryption } from '@/lib/mmkv';
import { useBiometricGate } from '@/hooks/useBiometricGate';
import { useTheme } from '@/hooks/useTheme';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  handleInitialNotification,
} from '@/services/notifications';
import { getMobileSyncService } from '@/services/conversationSync';
import { registerBackgroundFetch, unregisterBackgroundFetch } from '@/services/backgroundFetch';
import { subscribeToRealtime, unsubscribeFromRealtime } from '@/services/realtime';
import { subscribeToDispatch, unsubscribeFromDispatch } from '@/services/dispatchRealtime';
import { startDesktopStatusPolling } from '@/services/desktopStatus';
import { useChatStore } from '@/stores/chatStore';
import '../global.css';

export default function RootLayout() {
  const { session, isLoading, isInitialized, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const url = useURL();
  const backPressCount = useRef(0);
  const { colors: themeColors, statusBarStyle } = useTheme();
  const { isUnlocked, authenticate } = useBiometricGate();

  // Initialise MMKV encryption before any store access.
  // This must run before initialize() so that the Zustand persist middleware
  // can access the encrypted MMKV instance when rehydrating.
  useEffect(() => {
    initMmkvEncryption()
      .then(() => initialize())
      .catch((err) => {
        // Fall through to initialize anyway so auth guard still runs
        console.warn('[RootLayout] MMKV encryption init failed:', err);
        initialize();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push notifications — register + listeners
  useEffect(() => {
    if (!session) return;

    registerForPushNotifications();
    const removeListeners = setupNotificationListeners();

    // Handle the notification that cold-started the app
    handleInitialNotification();

    return removeListeners;
  }, [session]);

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
  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    // segments[0] is typed based on known routes; cast to string for onboarding comparison
    const inOnboarding = (segments[0] as string) === 'onboarding';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Check if user has completed onboarding
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone && !inOnboarding) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace('/onboarding' as any);
      } else {
        router.replace('/(app)');
      }
    } else if (session && !inAuthGroup && !inOnboarding) {
      // Already in app — ensure onboarding is done
      const onboardingDone = storage.getString('onboarding-done');
      if (!onboardingDone) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace('/onboarding' as any);
      }
    }
  }, [session, isInitialized, segments, router]);

  // C1: Deep linking — handles agiworkforce://pair/CODE and agiworkforce://pair?code=CODE
  // Required for QR desktop pairing when app is backgrounded or closed
  useEffect(() => {
    if (!url || !session || !isInitialized) return;

    const parsed = Linking.parse(url);
    const isPairRoute = parsed.hostname === 'pair' || parsed.path?.startsWith('pair');

    if (isPairRoute) {
      const code =
        (parsed.queryParams?.code as string | undefined) ??
        parsed.path?.split('/').filter(Boolean).pop();

      if (code) {
        const PAIRING_CODE_RE = /^[A-Za-z0-9]{8}$/;
        if (!PAIRING_CODE_RE.test(code)) {
          return;
        }
        router.push(`/(app)/companion?pairingCode=${encodeURIComponent(code)}`);
      }
    }
  }, [url, session, isInitialized, router]);

  // C1b: Share intent handling — receive text/URL shared from other apps
  useEffect(() => {
    if (!session || !isInitialized) return;

    const handleShare = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (!initialUrl) return;

      // Android share intents come as plain text content, not URLs
      // They are typically passed as EXTRA_TEXT via the intent
      // expo-linking captures these in the URL query params
      const parsed = Linking.parse(initialUrl);
      const sharedText =
        (parsed.queryParams?.['android.intent.extra.TEXT'] as string | undefined) ??
        (parsed.queryParams?.text as string | undefined);

      if (sharedText && sharedText.trim()) {
        // Create a new chat with the shared content
        const { createConversation, sendMessage } = await import('@/stores/chatStore').then((m) =>
          m.useChatStore.getState(),
        );
        const { selectedModel } = await import('@/stores/modelStore').then((m) =>
          m.useModelStore.getState(),
        );
        const title = sharedText.length > 40 ? sharedText.slice(0, 40).trim() + '...' : sharedText;
        try {
          const id = await createConversation(title);
          sendMessage(id, sharedText, selectedModel);
          router.push(`/(app)/chat/${id}` as Parameters<typeof router.push>[0]);
        } catch (err) {
          // Fall through — app opens normally
          console.warn('[RootLayout] Share intent handling failed:', err);
        }
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

  if (!isInitialized || isLoading) {
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

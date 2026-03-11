import { useEffect, useRef } from 'react';
import { useRouter, useSegments, Slot } from 'expo-router';
import { useURL } from 'expo-linking';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, BackHandler, Platform, ToastAndroid } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/lib/theme';
import { storage, initMmkvEncryption } from '@/lib/mmkv';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  handleInitialNotification,
} from '@/services/notifications';
import '../global.css';

export default function RootLayout() {
  const { session, isLoading, isInitialized, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const url = useURL();
  const backPressCount = useRef(0);

  // Initialise MMKV encryption before any store access.
  // This must run before initialize() so that the Zustand persist middleware
  // can access the encrypted MMKV instance when rehydrating.
  useEffect(() => {
    initMmkvEncryption()
      .then(() => initialize())
      .catch((err) => {
        console.error('[layout] Failed to initialise MMKV encryption:', err);
        // Fall through to initialize anyway so auth guard still runs
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
        router.push(`/(app)/companion?pairingCode=${encodeURIComponent(code)}`);
      }
    }
  }, [url, session, isInitialized, router]);

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
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.teal} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Slot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { AuthView } from '@clerk/expo/native';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useThemeColors } from '@/src/ui/theme';

/**
 * Cloud sign-in screen.
 *
 * Renders Clerk's prebuilt native AuthView (combined sign-in-or-up). The native
 * component syncs the Clerk session automatically — no setActive() call. Once
 * signed in, we redirect into the app. Dismissing returns to Local Mode.
 */
export default function LoginScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isLoaded, isSignedIn } = useAuth();

  // Build gate: when cloud auth is disabled, Local Mode is the only path.
  if (!FEATURES.auth) return <Redirect href="/(app)" />;
  if (isLoaded && isSignedIn) return <Redirect href="/(app)" />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View style={{ flex: 1 }} testID="cloud-sign-in-screen">
        <AuthView mode="signInOrUp" isDismissible onDismiss={() => router.replace('/(app)')} />
      </View>
    </SafeAreaView>
  );
}
